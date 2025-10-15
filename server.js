// server.js
const express = require('express');
const http = require('http');
const path = require('path');
const axios = require('axios');
const { WebSocketServer } = require('ws');
const { v4: uuidv4 } = require('uuid');

const app = express();
const port = process.env.PORT || 7778;

// --- Serve Static Frontend Files ---
app.use(express.static(path.join(__dirname, '/')));

// --- API Endpoints ---
app.get('/api/champions', async (req, res) => {
    try {
        // First, get the latest Data Dragon version
        const versionResponse = await axios.get('https://ddragon.leagueoflegends.com/api/versions.json');
        const latestVersion = versionResponse.data[0]; // First item is the latest version

        console.log(`Using Data Dragon version: ${latestVersion}`);

        // Fetch champion data using the latest version
        const response = await axios.get(`https://ddragon.leagueoflegends.com/cdn/${latestVersion}/data/en_US/champion.json`);
        const championsData = response.data.data;

        // Transform into array with name, id, and image URL
        const champions = Object.values(championsData).map(champ => ({
            id: champ.id,
            name: champ.name,
            image: `https://ddragon.leagueoflegends.com/cdn/${latestVersion}/img/champion/${champ.id}.png`
        }));

        res.json(champions);
    } catch (error) {
        console.error('Failed to fetch champion data:', error);
        res.status(500).json({ error: 'Failed to fetch champion data' });
    }
});

app.get('/api/draft/default-room', (req, res) => {
    // Generate a new unique room ID for each request
    const newRoomId = uuidv4();
    createNewRoom(newRoomId);
    res.json({ roomId: newRoomId });
});

app.get('/api/draft/:roomId', (req, res) => {
    const { roomId } = req.params;
    if (rooms[roomId]) {
        res.json(rooms[roomId].draftState);
    } else {
        res.status(404).json({ error: 'Room not found' });
    }
});

// --- Server Setup ---
const server = http.createServer(app);

// --- Draft Game State ---
// Tournament draft order (modern LoL pro play):
// Ban Phase 1: B-R-B-R-B-R (3 bans each)
// Pick Phase 1: B, R-R, B-B, R (1-2-2-1)
// Ban Phase 2: R-R, B-B (2 bans each)
// Pick Phase 2: B, R-R, B (1-2-1)
const DRAFT_ORDER = [
    // Ban Phase 1 (6 bans total)
    { team: 'blue', action: 'ban' },
    { team: 'red', action: 'ban' },
    { team: 'blue', action: 'ban' },
    { team: 'red', action: 'ban' },
    { team: 'blue', action: 'ban' },
    { team: 'red', action: 'ban' },

    // Pick Phase 1 (6 picks total)
    { team: 'blue', action: 'pick' },
    { team: 'red', action: 'pick' },
    { team: 'red', action: 'pick' },
    { team: 'blue', action: 'pick' },
    { team: 'blue', action: 'pick' },
    { team: 'red', action: 'pick' },

    // Ban Phase 2 (4 bans total)
    { team: 'red', action: 'ban' },
    { team: 'blue', action: 'ban' },
    { team: 'red', action: 'ban' },
    { team: 'blue', action: 'ban' },

    // Pick Phase 2 (4 picks total)
    { team: 'red', action: 'pick' },
    { team: 'blue', action: 'pick' },
    { team: 'red', action: 'pick' },
    { team: 'blue', action: 'pick' }
];

const rooms = {};
const defaultRoomId = uuidv4();
const roomCleanupTimers = new Map(); // Track cleanup timers for empty rooms
const ROOM_CLEANUP_DELAY = 120000; // 120 seconds in milliseconds

function createNewRoom(roomId) {
    rooms[roomId] = {
        id: roomId,
        draftState: {
            phase: 'idle',
            currentTurn: 0,
            blueBans: [],
            redBans: [],
            bluePicks: [],
            redPicks: [],
            currentTeam: 'blue',
            currentAction: 'ban',
            braveryModeUsedChampions: [],
            bluePlayers: [],
            redPlayers: [],
            blueCaptain: null,
            redCaptain: null,
            hostName: null // Track who created/hosts the room
        },
        isBraveryMode: false,
        braveryModeUsedChampions: new Set(),
        clients: new Set()
    };
    console.log(`Created new room: ${roomId}`);
}

function deleteRoom(roomId) {
    // Don't delete the default room
    if (roomId === defaultRoomId) {
        console.log(`Skipping deletion of default room: ${roomId}`);
        return;
    }

    if (rooms[roomId]) {
        delete rooms[roomId];
        console.log(`Deleted empty room: ${roomId}`);
    }

    // Clear any pending cleanup timer
    if (roomCleanupTimers.has(roomId)) {
        clearTimeout(roomCleanupTimers.get(roomId));
        roomCleanupTimers.delete(roomId);
    }
}

function scheduleRoomCleanup(roomId) {
    // Don't schedule cleanup for default room
    if (roomId === defaultRoomId) {
        return;
    }

    // Cancel any existing cleanup timer
    if (roomCleanupTimers.has(roomId)) {
        clearTimeout(roomCleanupTimers.get(roomId));
    }

    // Schedule new cleanup
    const timer = setTimeout(() => {
        if (rooms[roomId] && rooms[roomId].clients.size === 0) {
            deleteRoom(roomId);
        }
        roomCleanupTimers.delete(roomId);
    }, ROOM_CLEANUP_DELAY);

    roomCleanupTimers.set(roomId, timer);
    console.log(`Scheduled cleanup for room ${roomId} in ${ROOM_CLEANUP_DELAY / 1000} seconds`);
}

function cancelRoomCleanup(roomId) {
    if (roomCleanupTimers.has(roomId)) {
        clearTimeout(roomCleanupTimers.get(roomId));
        roomCleanupTimers.delete(roomId);
        console.log(`Cancelled cleanup for room ${roomId}`);
    }
}

createNewRoom(defaultRoomId);

function getRoomFromClient(ws) {
    for (const roomId in rooms) {
        if (rooms[roomId].clients.has(ws)) {
            return rooms[roomId];
        }
    }
    return null;
}

function broadcastState(room) {
    const message = JSON.stringify({
        type: 'draft_update',
        gameState: { ...room.draftState, isBraveryMode: room.isBraveryMode }
    });

    room.clients.forEach(client => {
        if (client.readyState === 1) { // WebSocket.OPEN
            client.send(message);
        }
    });
}

function resetDraft(room) {
    room.draftState = {
        phase: 'idle',
        currentTurn: 0,
        blueBans: [],
        redBans: [],
        bluePicks: [],
        redPicks: [],
        currentTeam: 'blue',
        currentAction: 'ban',
        braveryModeUsedChampions: [],
        bluePlayers: room.draftState.bluePlayers, // Keep players on reset
        redPlayers: room.draftState.redPlayers,
        blueCaptain: room.draftState.blueCaptain, // Keep captains on reset
        redCaptain: room.draftState.redCaptain,
        hostName: room.draftState.hostName // Keep host on reset
    };
}

function processDraftAction(champion, playerName, room) {
    const { draftState } = room;

    if (draftState.phase !== 'drafting') {
        return { success: false, error: 'Draft not in progress' };
    }

    if (draftState.currentTurn >= DRAFT_ORDER.length) {
        draftState.phase = 'complete';
        return { success: false, error: 'Draft already complete' };
    }

    const currentStep = DRAFT_ORDER[draftState.currentTurn];
    const { team, action } = currentStep;

    if (action === 'ban') {
        const captain = team === 'blue' ? draftState.blueCaptain : draftState.redCaptain;
        if (playerName !== captain) {
            return { success: false, error: 'Only the captain can ban champions.' };
        }
    }

    // Check if champion is already banned or picked
    const allBans = [...draftState.blueBans, ...draftState.redBans, ...draftState.braveryModeUsedChampions];
    const allPicks = [...draftState.bluePicks, ...draftState.redPicks];

    if (allBans.includes(champion) || allPicks.includes(champion)) {
        return { success: false, error: 'Champion already banned or picked' };
    }

    // Add champion to appropriate list
    if (action === 'ban') {
        if (team === 'blue') {
            draftState.blueBans.push(champion);
        } else {
            draftState.redBans.push(champion);
        }
    } else if (action === 'pick') {
        if (team === 'blue') {
            draftState.bluePicks.push(champion);
        } else {
            draftState.redPicks.push(champion);
        }
    }

    // Advance to next turn
    draftState.currentTurn++;

    if (draftState.currentTurn < DRAFT_ORDER.length) {
        const nextStep = DRAFT_ORDER[draftState.currentTurn];
        draftState.currentTeam = nextStep.team;
        draftState.currentAction = nextStep.action;
    } else {
        draftState.phase = 'complete';
        draftState.currentTeam = null;
        draftState.currentAction = null;
    }

    // Broadcast updated state
    broadcastState(room);

    return { success: true };
}

// --- WebSocket Server Setup ---
const wss = new WebSocketServer({ server });

// --- SERVER STATE ---
let isBraveryMode = false;
let braveryModeUsedChampions = new Set();

wss.on('connection', (ws, req) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    let roomId = url.searchParams.get('roomId') || defaultRoomId;

    if (!rooms[roomId]) {
        createNewRoom(roomId);
    }

    const room = rooms[roomId];
    room.clients.add(ws);

    // Cancel any pending cleanup since room is no longer empty
    cancelRoomCleanup(roomId);

    console.log(`Client connected to room: ${roomId} (${room.clients.size} clients)`);

    // Send current draft state to newly connected client
    ws.send(JSON.stringify({
        type: 'draft_update',
        gameState: room.draftState
    }));

        ws.on('message', (message) => {
            const room = getRoomFromClient(ws);
            if (!room) {
                console.error('Received message from client not in any room.');
                return;
            }
    
            console.log(`Received message in room ${room.id} => %s`, message);
            try {
                const data = JSON.parse(message);
    
                // Handle different message types
                switch (data.type) {
                    case 'connect_to_room':
                        // Client requests to move to a specific room
                        {
                            const requested = (typeof data.roomId === 'string' && data.roomId === 'null') ? null : data.roomId;
                            const targetRoomId = requested || defaultRoomId;

                            if (!rooms[targetRoomId]) createNewRoom(targetRoomId);

                            const currentRoom = getRoomFromClient(ws);
                            if (currentRoom && currentRoom.id !== targetRoomId) {
                                currentRoom.clients.delete(ws);
                                console.log(`Moved client from room ${currentRoom.id} to ${targetRoomId}`);
                            }

                            rooms[targetRoomId].clients.add(ws);
                            ws.send(JSON.stringify({ type: 'draft_update', gameState: rooms[targetRoomId].draftState }));
                        }
                        break;

                    case 'join_team':
                    {
                        const targetTeam = data.team;
                        const oppositeTeam = targetTeam === 'blue' ? 'red' : 'blue';

                        // Set host if this is the first player joining
                        if (!room.draftState.hostName) {
                            room.draftState.hostName = data.playerName;
                            console.log(`${data.playerName} is now the host of room ${room.id}`);
                        }

                        // Remove player from both teams first (to handle team switching)
                        room.draftState.bluePlayers = room.draftState.bluePlayers.filter(p => p !== data.playerName);
                        room.draftState.redPlayers = room.draftState.redPlayers.filter(p => p !== data.playerName);

                        // Clear captain status if this player was captain of the opposite team
                        if (room.draftState.blueCaptain === data.playerName) {
                            room.draftState.blueCaptain = null;
                        }
                        if (room.draftState.redCaptain === data.playerName) {
                            room.draftState.redCaptain = null;
                        }

                        // Check if requesting to be captain of a team that already has one
                        if (data.isCaptain) {
                            const captainProp = targetTeam === 'blue' ? 'blueCaptain' : 'redCaptain';
                            if (room.draftState[captainProp] && room.draftState[captainProp] !== data.playerName) {
                                ws.send(JSON.stringify({ type: 'error', message: 'This team already has a captain.' }));
                                return;
                            }
                        }

                        // Add player to the target team
                        if (targetTeam === 'blue') {
                            if (!room.draftState.bluePlayers.includes(data.playerName)) {
                                room.draftState.bluePlayers.push(data.playerName);
                            }
                            if (data.isCaptain) {
                                room.draftState.blueCaptain = data.playerName;
                            }
                        } else if (targetTeam === 'red') {
                            if (!room.draftState.redPlayers.includes(data.playerName)) {
                                room.draftState.redPlayers.push(data.playerName);
                            }
                            if (data.isCaptain) {
                                room.draftState.redCaptain = data.playerName;
                            }
                        }

                        console.log(`Player ${data.playerName} joined ${targetTeam} team${data.isCaptain ? ' as captain' : ''}`);
                        console.log(`Room ${room.id} state - Blue: [${room.draftState.bluePlayers.join(', ')}], Red: [${room.draftState.redPlayers.join(', ')}]`);
                        console.log(`Captains - Blue: ${room.draftState.blueCaptain}, Red: ${room.draftState.redCaptain}`);
                        console.log(`Host: ${room.draftState.hostName}`);
                        broadcastState(room);
                    }
                    break;

                                case 'set_bravery_mode':
                                    // Only allow host to change bravery mode
                                    if (data.playerName !== room.draftState.hostName) {
                                        ws.send(JSON.stringify({
                                            type: 'error',
                                            message: 'Only the host can toggle Bravery Mode.'
                                        }));
                                        console.log(`${data.playerName} tried to toggle Bravery Mode but is not host`);
                                        return;
                                    }

                                    room.isBraveryMode = data.enabled;
                                    console.log(`Bravery Mode set to: ${room.isBraveryMode} in room ${room.id} by host ${data.playerName}`);
                                    broadcastState(room);
                                    break;    
                    case 'reset_bravery_session':
                        // Only allow host to reset bravery session
                        if (data.playerName !== room.draftState.hostName) {
                            ws.send(JSON.stringify({
                                type: 'error',
                                message: 'Only the host can reset Bravery Mode session.'
                            }));
                            console.log(`${data.playerName} tried to reset Bravery Mode but is not host`);
                            return;
                        }

                        room.braveryModeUsedChampions.clear();
                        room.draftState.braveryModeUsedChampions = [];
                        console.log(`Bravery Mode session reset by host ${data.playerName}. Used champions cleared.`);
                        broadcastState(room); // Broadcast the updated state
                        ws.send(JSON.stringify({ type: 'notification', message: 'Bravery Mode session has been reset.' }));
                        break;
    
                    case 'begin_draft':
                        // Alias: clients may send begin_draft to start the draft
                        // fallthrough to start_draft logic
                    case 'start_draft':
                        resetDraft(room);
    
                        if (room.isBraveryMode) {
                            room.draftState.braveryModeUsedChampions = Array.from(room.braveryModeUsedChampions);
                        }
    
                        room.draftState.phase = 'drafting';
                        room.draftState.currentTeam = DRAFT_ORDER[0].team;
                        room.draftState.currentAction = DRAFT_ORDER[0].action;
                        console.log('Draft started');
                        broadcastState(room);
                        break;
    
                    case 'ban':
                    case 'pick':
                        // Check Bravery Mode logic for picks
                        if (data.type === 'pick' && room.isBraveryMode && room.braveryModeUsedChampions.has(data.champion)) {
                            ws.send(JSON.stringify({
                                type: 'pick_rejected',
                                champion: data.champion,
                                reason: 'Champion already used in this Bravery Mode session.'
                            }));
                            console.log(`Rejected pick: ${data.champion} (already used in Bravery Mode).`);
                            return; // Stop further processing for this rejected pick
                        }
    
                        const result = processDraftAction(data.champion, data.playerName, room);
                        if (result.success) {
                            if (data.type === 'pick' && room.isBraveryMode) {
                                room.braveryModeUsedChampions.add(data.champion);
                                console.log(`Bravery Mode: Added ${data.champion} to used champions.`);
                            }
                        } else {
                            console.log('Draft action failed:', result.error);
                            ws.send(JSON.stringify({
                                type: 'error',
                                message: result.error
                            }));
                        }
                        break;
    
                    default:
                        console.log('Unknown message type:', data.type);
                        break;
                }
            } catch (e) {
                console.error("Failed to parse message or handle logic:", e);
            }
        });
    ws.on('close', () => {
        const room = getRoomFromClient(ws);
        if (room) {
            room.clients.delete(ws);
            console.log(`Client disconnected from room: ${room.id} (${room.clients.size} clients remaining)`);

            // Schedule room cleanup if empty
            if (room.clients.size === 0) {
                scheduleRoomCleanup(room.id);
            }
        }
    });
});

server.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});

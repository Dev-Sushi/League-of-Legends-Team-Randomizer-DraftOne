// server.js
const express = require('express');
const http = require('http');
const path = require('path');
const { WebSocketServer } = require('ws');

const app = express();
const port = process.env.PORT || 7778;

// --- Serve Static Frontend Files ---
app.use(express.static(path.join(__dirname, '/')));

// --- Server Setup ---
const server = http.createServer(app);

// --- Draft Game State ---
// Tournament draft order (modern LoL pro play)
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
const roomCleanupTimers = new Map();
const ROOM_CLEANUP_DELAY = 120000; // 120 seconds

function generateRoomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Removed ambiguous chars
    let code = '';
    for (let i = 0; i < 6; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

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
            fearlessUsedChampions: []
        },
        fearlessDraftEnabled: false,
        fearlessUsedChampions: new Set(),
        bluePlayer: null,    // WebSocket connection
        redPlayer: null,     // WebSocket connection
        bluePlayerName: null,
        redPlayerName: null,
        spectators: [],      // Array of { ws, name } objects
        host: null,          // WebSocket connection of room creator
        createdAt: Date.now()
    };
    console.log(`Created new room: ${roomId}`);
    return rooms[roomId];
}

function deleteRoom(roomId) {
    if (rooms[roomId]) {
        delete rooms[roomId];
        console.log(`Deleted room: ${roomId}`);
    }
    if (roomCleanupTimers.has(roomId)) {
        clearTimeout(roomCleanupTimers.get(roomId));
        roomCleanupTimers.delete(roomId);
    }
}

function scheduleRoomCleanup(roomId) {
    if (roomCleanupTimers.has(roomId)) {
        clearTimeout(roomCleanupTimers.get(roomId));
    }

    const timer = setTimeout(() => {
        const room = rooms[roomId];
        if (room && !room.bluePlayer && !room.redPlayer && room.spectators.length === 0) {
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

function broadcastToRoom(room, message, excludeWs = null) {
    const messageStr = JSON.stringify(message);
    // Broadcast to team players
    [room.bluePlayer, room.redPlayer].forEach(player => {
        if (player && player !== excludeWs && player.readyState === 1) {
            player.send(messageStr);
        }
    });
    // Broadcast to spectators
    room.spectators.forEach(spectator => {
        if (spectator.ws && spectator.ws !== excludeWs && spectator.ws.readyState === 1) {
            spectator.ws.send(messageStr);
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
        fearlessUsedChampions: room.fearlessDraftEnabled ? Array.from(room.fearlessUsedChampions) : []
    };
}

function processDraftAction(champion, playerTeam, room) {
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

    // Validate turn ownership
    if (playerTeam !== team) {
        return { success: false, error: 'Not your turn' };
    }

    // Check if champion is already banned or picked
    const allBans = [...draftState.blueBans, ...draftState.redBans];
    const allPicks = [...draftState.bluePicks, ...draftState.redPicks];
    const fearlessUsed = draftState.fearlessUsedChampions || [];

    if (allBans.includes(champion) || allPicks.includes(champion) || fearlessUsed.includes(champion)) {
        return { success: false, error: 'Champion already banned, picked, or used in fearless mode' };
    }

    // Check fearless mode for picks
    if (action === 'pick' && room.fearlessDraftEnabled && room.fearlessUsedChampions.has(champion)) {
        return { success: false, error: 'Champion already used in this Fearless session' };
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

        // Add to fearless used champions
        if (room.fearlessDraftEnabled) {
            room.fearlessUsedChampions.add(champion);
            draftState.fearlessUsedChampions = Array.from(room.fearlessUsedChampions);
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

    return { success: true };
}

// --- WebSocket Server Setup ---
const wss = new WebSocketServer({ server });

wss.on('connection', (ws) => {
    console.log('New WebSocket connection');
    let currentRoom = null;
    let currentTeam = null;

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            console.log('Received:', data.type, data);

            switch (data.type) {
                case 'create_room': {
                    let roomCode;
                    do {
                        roomCode = generateRoomCode();
                    } while (rooms[roomCode]);

                    const room = createNewRoom(roomCode);
                    room.bluePlayer = ws;
                    room.bluePlayerName = data.playerName || 'Player 1';
                    room.host = ws;
                    currentRoom = room;
                    currentTeam = 'blue';

                    cancelRoomCleanup(roomCode);

                    ws.send(JSON.stringify({
                        type: 'room_created',
                        roomCode: roomCode,
                        team: 'blue',
                        isHost: true,
                        draftState: room.draftState,
                        fearlessDraftEnabled: room.fearlessDraftEnabled
                    }));

                    console.log(`Room ${roomCode} created by ${room.bluePlayerName} (blue team)`);
                    break;
                }

                case 'join_room': {
                    const roomCode = data.roomCode.toUpperCase();
                    const room = rooms[roomCode];

                    if (!room) {
                        ws.send(JSON.stringify({
                            type: 'error',
                            message: 'Room not found'
                        }));
                        break;
                    }

                    let joinedTeam;
                    const playerName = data.playerName || 'Player';

                    // Assign to red team if available, otherwise spectator
                    if (!room.redPlayer) {
                        room.redPlayer = ws;
                        room.redPlayerName = playerName;
                        joinedTeam = 'red';
                        currentRoom = room;
                        currentTeam = 'red';

                        console.log(`${playerName} joined room ${roomCode} (red team)`);

                        // Notify other players
                        broadcastToRoom(room, {
                            type: 'opponent_joined',
                            opponentName: playerName
                        }, ws);
                    } else {
                        // Both teams full, join as spectator
                        room.spectators.push({ ws, name: playerName });
                        joinedTeam = 'spectator';
                        currentRoom = room;
                        currentTeam = 'spectator';

                        console.log(`${playerName} joined room ${roomCode} (spectator)`);

                        // Notify other players
                        broadcastToRoom(room, {
                            type: 'room_update',
                            bluePlayerName: room.bluePlayerName,
                            redPlayerName: room.redPlayerName,
                            spectators: room.spectators.map(s => s.name)
                        }, ws);
                    }

                    cancelRoomCleanup(roomCode);

                    ws.send(JSON.stringify({
                        type: 'room_joined',
                        roomCode: roomCode,
                        team: joinedTeam,
                        isHost: false,
                        draftState: room.draftState,
                        fearlessDraftEnabled: room.fearlessDraftEnabled,
                        bluePlayerName: room.bluePlayerName,
                        redPlayerName: room.redPlayerName,
                        spectators: room.spectators.map(s => s.name)
                    }));

                    break;
                }

                case 'start_draft': {
                    if (!currentRoom) {
                        ws.send(JSON.stringify({
                            type: 'error',
                            message: 'Not in a room'
                        }));
                        break;
                    }

                    // Only blue player (room creator) can start draft
                    if (currentTeam !== 'blue') {
                        ws.send(JSON.stringify({
                            type: 'error',
                            message: 'Only the room creator can start the draft'
                        }));
                        break;
                    }

                    resetDraft(currentRoom);
                    currentRoom.draftState.phase = 'drafting';
                    currentRoom.draftState.currentTeam = DRAFT_ORDER[0].team;
                    currentRoom.draftState.currentAction = DRAFT_ORDER[0].action;

                    broadcastToRoom(currentRoom, {
                        type: 'draft_started',
                        draftState: currentRoom.draftState
                    });

                    console.log(`Draft started in room ${currentRoom.id}`);
                    break;
                }

                case 'draft_action': {
                    if (!currentRoom) {
                        ws.send(JSON.stringify({
                            type: 'error',
                            message: 'Not in a room'
                        }));
                        break;
                    }

                    const result = processDraftAction(data.champion, currentTeam, currentRoom);

                    if (result.success) {
                        broadcastToRoom(currentRoom, {
                            type: 'draft_update',
                            draftState: currentRoom.draftState,
                            champion: data.champion,
                            team: currentTeam,
                            action: currentRoom.draftState.currentAction
                        });
                    } else {
                        ws.send(JSON.stringify({
                            type: 'error',
                            message: result.error
                        }));
                    }
                    break;
                }

                case 'toggle_fearless': {
                    if (!currentRoom) {
                        ws.send(JSON.stringify({
                            type: 'error',
                            message: 'Not in a room'
                        }));
                        break;
                    }

                    // Only blue player (room creator) can toggle
                    if (currentTeam !== 'blue') {
                        ws.send(JSON.stringify({
                            type: 'error',
                            message: 'Only the room creator can toggle Fearless Draft'
                        }));
                        break;
                    }

                    currentRoom.fearlessDraftEnabled = data.enabled;

                    broadcastToRoom(currentRoom, {
                        type: 'fearless_toggled',
                        enabled: data.enabled
                    });

                    console.log(`Fearless Draft ${data.enabled ? 'enabled' : 'disabled'} in room ${currentRoom.id}`);
                    break;
                }

                case 'reset_fearless': {
                    if (!currentRoom) {
                        ws.send(JSON.stringify({
                            type: 'error',
                            message: 'Not in a room'
                        }));
                        break;
                    }

                    if (currentTeam !== 'blue') {
                        ws.send(JSON.stringify({
                            type: 'error',
                            message: 'Only the room creator can reset Fearless session'
                        }));
                        break;
                    }

                    currentRoom.fearlessUsedChampions.clear();
                    currentRoom.draftState.fearlessUsedChampions = [];

                    broadcastToRoom(currentRoom, {
                        type: 'fearless_reset'
                    });

                    console.log(`Fearless session reset in room ${currentRoom.id}`);
                    break;
                }

                case 'switch_team': {
                    if (!currentRoom) {
                        ws.send(JSON.stringify({
                            type: 'error',
                            message: 'Not in a room'
                        }));
                        break;
                    }

                    const newTeam = data.team; // 'blue', 'red', or 'spectator'
                    const playerName = data.playerName || 'Player';

                    // Validate new team
                    if (!['blue', 'red', 'spectator'].includes(newTeam)) {
                        ws.send(JSON.stringify({
                            type: 'error',
                            message: 'Invalid team'
                        }));
                        break;
                    }

                    // Can't switch during an active draft
                    if (currentRoom.draftState.phase === 'drafting') {
                        ws.send(JSON.stringify({
                            type: 'error',
                            message: 'Cannot switch teams during an active draft'
                        }));
                        break;
                    }

                    // Check if target team is already occupied
                    if (newTeam === 'blue' && currentRoom.bluePlayer && currentRoom.bluePlayer !== ws) {
                        ws.send(JSON.stringify({
                            type: 'error',
                            message: 'Blue team is already occupied'
                        }));
                        break;
                    }

                    if (newTeam === 'red' && currentRoom.redPlayer && currentRoom.redPlayer !== ws) {
                        ws.send(JSON.stringify({
                            type: 'error',
                            message: 'Red team is already occupied'
                        }));
                        break;
                    }

                    // Remove player from current position
                    if (currentTeam === 'blue') {
                        currentRoom.bluePlayer = null;
                        currentRoom.bluePlayerName = null;
                    } else if (currentTeam === 'red') {
                        currentRoom.redPlayer = null;
                        currentRoom.redPlayerName = null;
                    } else if (currentTeam === 'spectator') {
                        currentRoom.spectators = currentRoom.spectators.filter(s => s.ws !== ws);
                    }

                    // Add player to new position
                    if (newTeam === 'blue') {
                        currentRoom.bluePlayer = ws;
                        currentRoom.bluePlayerName = playerName;
                        currentTeam = 'blue';
                    } else if (newTeam === 'red') {
                        currentRoom.redPlayer = ws;
                        currentRoom.redPlayerName = playerName;
                        currentTeam = 'red';
                    } else if (newTeam === 'spectator') {
                        currentRoom.spectators.push({ ws, name: playerName });
                        currentTeam = 'spectator';
                    }

                    // Notify the player who switched
                    ws.send(JSON.stringify({
                        type: 'team_switched',
                        team: newTeam,
                        isHost: ws === currentRoom.host,
                        draftState: currentRoom.draftState
                    }));

                    // Notify all other players in the room
                    broadcastToRoom(currentRoom, {
                        type: 'room_update',
                        bluePlayerName: currentRoom.bluePlayerName,
                        redPlayerName: currentRoom.redPlayerName,
                        spectators: currentRoom.spectators.map(s => s.name)
                    }, ws);

                    console.log(`Player switched to ${newTeam} in room ${currentRoom.id}`);
                    break;
                }

                default:
                    console.log('Unknown message type:', data.type);
                    break;
            }
        } catch (e) {
            console.error('Failed to parse message:', e);
        }
    });

    ws.on('close', () => {
        if (currentRoom) {
            if (currentTeam === 'blue') {
                currentRoom.bluePlayer = null;
                currentRoom.bluePlayerName = null;
            } else if (currentTeam === 'red') {
                currentRoom.redPlayer = null;
                currentRoom.redPlayerName = null;
            } else if (currentTeam === 'spectator') {
                currentRoom.spectators = currentRoom.spectators.filter(s => s.ws !== ws);
            }

            // Notify other players
            broadcastToRoom(currentRoom, {
                type: 'player_disconnected',
                team: currentTeam,
                bluePlayerName: currentRoom.bluePlayerName,
                redPlayerName: currentRoom.redPlayerName,
                spectators: currentRoom.spectators.map(s => s.name)
            });

            console.log(`Player disconnected from room ${currentRoom.id} (${currentTeam} ${currentTeam === 'spectator' ? 'spectator' : 'team'})`);

            // Schedule cleanup if room is empty
            if (!currentRoom.bluePlayer && !currentRoom.redPlayer && currentRoom.spectators.length === 0) {
                scheduleRoomCleanup(currentRoom.id);
            }
        }
    });
});

server.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
    console.log(`WebSocket server ready for connections`);
});

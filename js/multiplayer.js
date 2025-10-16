// --- MULTIPLAYER MODULE ---
// Handles WebSocket connection and multiplayer draft synchronization

let ws = null;
let currentRoomCode = null;
let currentTeam = null;
let isMultiplayerMode = false;
let isHost = false;
let playerName = 'Player';
let onDraftUpdateCallback = null;
let onRoomStatusCallback = null;
let onRoomUpdateCallback = null;

/**
 * Initialize multiplayer module
 */
export function initMultiplayer() {
    // Generate or retrieve player name
    playerName = localStorage.getItem('playerName') || `Player${Math.floor(Math.random() * 1000)}`;
    localStorage.setItem('playerName', playerName);
}

/**
 * Connect to WebSocket server
 */
function connectWebSocket() {
    return new Promise((resolve, reject) => {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}`;

        ws = new WebSocket(wsUrl);

        ws.onopen = () => {
            console.log('WebSocket connected');
            updateConnectionStatus(true);
            resolve();
        };

        ws.onerror = (error) => {
            console.error('WebSocket error:', error);
            updateConnectionStatus(false);
            reject(error);
        };

        ws.onclose = () => {
            console.log('WebSocket disconnected');
            updateConnectionStatus(false);

            // Attempt reconnection after 3 seconds if in multiplayer mode
            if (isMultiplayerMode) {
                setTimeout(() => {
                    if (currentRoomCode) {
                        console.log('Attempting to reconnect...');
                        reconnectToRoom();
                    }
                }, 3000);
            }
        };

        ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                handleServerMessage(data);
            } catch (e) {
                console.error('Failed to parse server message:', e);
            }
        };
    });
}

/**
 * Handle messages from server
 */
function handleServerMessage(data) {
    console.log('Received from server:', data.type, data);

    switch (data.type) {
        case 'room_created':
            currentRoomCode = data.roomCode;
            currentTeam = data.team;
            isHost = data.isHost || false;
            updateRoomUI(data.roomCode, data.team, false);
            if (onDraftUpdateCallback) {
                onDraftUpdateCallback(data.draftState, data.team);
            }
            if (data.fearlessDraftEnabled !== undefined) {
                updateFearlessState(data.fearlessDraftEnabled);
            }
            break;

        case 'room_joined':
            currentRoomCode = data.roomCode;
            currentTeam = data.team;
            isHost = data.isHost || false;
            updateRoomUI(data.roomCode, data.team, true);
            if (onDraftUpdateCallback) {
                onDraftUpdateCallback(data.draftState, data.team);
            }
            if (data.fearlessDraftEnabled !== undefined) {
                updateFearlessState(data.fearlessDraftEnabled);
            }
            // Update room players list
            if (onRoomUpdateCallback) {
                onRoomUpdateCallback({
                    bluePlayerName: data.bluePlayerName,
                    redPlayerName: data.redPlayerName,
                    spectators: data.spectators || []
                });
            }
            break;

        case 'opponent_joined':
            if (onRoomStatusCallback) {
                onRoomStatusCallback({
                    type: 'opponent_joined',
                    message: `${data.opponentName} joined the room`
                });
            }
            showNotification(`${data.opponentName} joined the draft`, 'success');
            break;

        case 'opponent_disconnected':
            if (onRoomStatusCallback) {
                onRoomStatusCallback({
                    type: 'opponent_disconnected',
                    message: 'Opponent disconnected'
                });
            }
            showNotification('Opponent disconnected', 'warning');
            break;

        case 'draft_started':
            if (onDraftUpdateCallback) {
                onDraftUpdateCallback(data.draftState, currentTeam);
            }
            break;

        case 'draft_update':
            if (onDraftUpdateCallback) {
                onDraftUpdateCallback(data.draftState, currentTeam);
            }
            break;

        case 'fearless_toggled':
            updateFearlessState(data.enabled);
            break;

        case 'fearless_reset':
            showNotification('Fearless Draft session reset', 'info');
            break;

        case 'team_switched':
            currentTeam = data.team;
            isHost = data.isHost || false;
            updateRoomUI(currentRoomCode, data.team, false);
            if (onDraftUpdateCallback) {
                onDraftUpdateCallback(data.draftState, data.team);
            }
            showNotification(`Switched to ${data.team === 'spectator' ? 'Spectator mode' : data.team.charAt(0).toUpperCase() + data.team.slice(1) + ' Team'}`, 'success');
            break;

        case 'room_update':
            if (onRoomUpdateCallback) {
                onRoomUpdateCallback({
                    bluePlayerName: data.bluePlayerName,
                    redPlayerName: data.redPlayerName,
                    spectators: data.spectators
                });
            }
            break;

        case 'player_disconnected':
            if (onRoomUpdateCallback) {
                onRoomUpdateCallback({
                    bluePlayerName: data.bluePlayerName,
                    redPlayerName: data.redPlayerName,
                    spectators: data.spectators
                });
            }
            const teamLabel = data.team === 'spectator' ? 'Spectator' : data.team.charAt(0).toUpperCase() + data.team.slice(1) + ' Team';
            showNotification(`${teamLabel} player disconnected`, 'warning');
            break;

        case 'error':
            showNotification(data.message, 'error');
            break;

        default:
            console.log('Unknown message type:', data.type);
    }
}

/**
 * Create a new multiplayer room
 */
export async function createRoom() {
    try {
        await connectWebSocket();
        sendMessage({
            type: 'create_room',
            playerName: playerName
        });
        isMultiplayerMode = true;
        return true;
    } catch (error) {
        console.error('Failed to create room:', error);
        showNotification('Failed to connect to server', 'error');
        return false;
    }
}

/**
 * Join an existing room
 */
export async function joinRoom(roomCode) {
    try {
        await connectWebSocket();
        sendMessage({
            type: 'join_room',
            roomCode: roomCode,
            playerName: playerName
        });
        isMultiplayerMode = true;
        return true;
    } catch (error) {
        console.error('Failed to join room:', error);
        showNotification('Failed to connect to server', 'error');
        return false;
    }
}

/**
 * Reconnect to existing room
 */
async function reconnectToRoom() {
    if (!currentRoomCode || !currentTeam) return;

    try {
        await connectWebSocket();
        sendMessage({
            type: currentTeam === 'blue' ? 'create_room' : 'join_room',
            roomCode: currentRoomCode,
            playerName: playerName
        });
    } catch (error) {
        console.error('Failed to reconnect:', error);
    }
}

/**
 * Start the draft
 */
export function startDraft() {
    sendMessage({
        type: 'start_draft'
    });
}

/**
 * Send a draft action (pick or ban)
 */
export function sendDraftAction(champion) {
    sendMessage({
        type: 'draft_action',
        champion: champion
    });
}

/**
 * Toggle fearless draft mode
 */
export function toggleFearlessDraft(enabled) {
    sendMessage({
        type: 'toggle_fearless',
        enabled: enabled
    });
}

/**
 * Reset fearless draft session
 */
export function resetFearlessSession() {
    sendMessage({
        type: 'reset_fearless'
    });
}

/**
 * Send a message to the server
 */
function sendMessage(message) {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(message));
    } else {
        console.error('WebSocket not connected');
        showNotification('Not connected to server', 'error');
    }
}

/**
 * Update room UI
 */
function updateRoomUI(roomCode, team, isJoiner) {
    const roomInfoElement = document.getElementById('multiplayer-room-info');
    const roomCodeElement = document.getElementById('room-code-display');
    const teamBadgeElement = document.getElementById('team-badge');
    const teamSwitcher = document.getElementById('team-switcher');
    const teamSwitcherConfirmBtn = document.getElementById('team-switcher-confirm-btn');
    const teamSwitcherPreview = document.getElementById('team-switcher-preview');

    if (roomInfoElement) {
        roomInfoElement.classList.remove('hidden');
    }

    if (roomCodeElement) {
        roomCodeElement.textContent = roomCode;
    }

    if (teamBadgeElement) {
        if (team === 'spectator') {
            teamBadgeElement.textContent = 'Spectator';
            teamBadgeElement.className = 'team-badge';
        } else {
            teamBadgeElement.textContent = team === 'blue' ? 'Blue Team' : 'Red Team';
            teamBadgeElement.className = `team-badge ${team}-team-badge`;
        }
    }

    // Update team switcher value
    if (teamSwitcher) {
        teamSwitcher.value = team;
    }

    // Reset preview and hide confirm button
    if (teamSwitcherConfirmBtn) {
        teamSwitcherConfirmBtn.classList.add('hidden');
    }

    if (teamSwitcherPreview) {
        teamSwitcherPreview.textContent = 'No changes';
        teamSwitcherPreview.className = 'team-switcher-preview no-change';
    }

    // Hide multiplayer setup UI
    const setupUI = document.getElementById('multiplayer-setup');
    if (setupUI) {
        setupUI.classList.add('hidden');
    }

    // Show draft controls
    const draftControls = document.getElementById('draft-controls-main');
    if (draftControls) {
        draftControls.classList.remove('hidden');
    }

    // Update start button visibility (only blue team/host can start)
    const startDraftBtn = document.getElementById('multiplayer-start-draft-btn');
    if (startDraftBtn) {
        if (team === 'blue' || isHost) {
            startDraftBtn.classList.remove('hidden');
            startDraftBtn.textContent = isJoiner ? 'Restart Draft' : 'Start Draft';
        } else {
            startDraftBtn.classList.add('hidden');
        }
    }
}

/**
 * Update fearless draft state
 */
function updateFearlessState(enabled) {
    const fearlessToggle = document.getElementById('fearless-draft-checkbox');
    if (fearlessToggle) {
        fearlessToggle.checked = enabled;
    }
}

/**
 * Update connection status indicator
 */
function updateConnectionStatus(connected) {
    const statusElement = document.getElementById('connection-status');
    if (statusElement) {
        if (connected) {
            statusElement.textContent = 'Connected';
            statusElement.className = 'connection-status connected';
        } else {
            statusElement.textContent = 'Disconnected';
            statusElement.className = 'connection-status disconnected';
        }
    }
}

/**
 * Show notification to user
 */
function showNotification(message, type = 'info') {
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.textContent = message;

    // Add to document
    const container = document.getElementById('notification-container') || createNotificationContainer();
    container.appendChild(notification);

    // Trigger animation
    setTimeout(() => notification.classList.add('show'), 10);

    // Remove after 3 seconds
    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

/**
 * Create notification container if it doesn't exist
 */
function createNotificationContainer() {
    const container = document.createElement('div');
    container.id = 'notification-container';
    container.className = 'notification-container';
    document.body.appendChild(container);
    return container;
}

/**
 * Switch to a different team or become a spectator
 */
export function switchTeam(team) {
    if (!['blue', 'red', 'spectator'].includes(team)) {
        console.error('Invalid team:', team);
        return;
    }

    sendMessage({
        type: 'switch_team',
        team: team,
        playerName: playerName
    });
}

/**
 * Register callback for draft updates
 */
export function onDraftUpdate(callback) {
    onDraftUpdateCallback = callback;
}

/**
 * Register callback for room status updates
 */
export function onRoomStatus(callback) {
    onRoomStatusCallback = callback;
}

/**
 * Register callback for room updates (player changes)
 */
export function onRoomUpdate(callback) {
    onRoomUpdateCallback = callback;
}

/**
 * Check if in multiplayer mode
 */
export function isInMultiplayerMode() {
    return isMultiplayerMode;
}

/**
 * Get current team
 */
export function getCurrentTeam() {
    return currentTeam;
}

/**
 * Get current room code
 */
export function getRoomCode() {
    return currentRoomCode;
}

/**
 * Leave room and disconnect
 */
export function leaveRoom() {
    if (ws) {
        ws.close();
        ws = null;
    }
    currentRoomCode = null;
    currentTeam = null;
    isMultiplayerMode = false;
}

/**
 * Set player name
 */
export function setPlayerName(name) {
    playerName = name;
    localStorage.setItem('playerName', name);
}

/**
 * Get player name
 */
export function getPlayerName() {
    return playerName;
}

/**
 * Check if current player is the host
 */
export function getIsHost() {
    return isHost;
}

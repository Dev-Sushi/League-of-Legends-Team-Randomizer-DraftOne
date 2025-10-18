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
let onRoleAssignmentsUpdateCallback = null;
let pendingRoleAssignments = null; // Store role assignments received before callback is registered
let lastKnownDraftState = null; // Track last known state to detect actual changes

// Connection robustness state
let reconnectAttempts = 0;
let maxReconnectAttempts = 10;
let reconnectTimeout = null;
let heartbeatInterval = null;
let heartbeatMissed = 0;
let maxHeartbeatMissed = 3;
let messageQueue = [];
let isReconnecting = false;
let connectionState = 'disconnected'; // 'connected', 'connecting', 'disconnected', 'reconnecting'

// Advanced network monitoring
let lastPingTime = 0;
let lastPongTime = 0;
let averageLatency = 0;
let latencyHistory = [];
let maxLatencyHistory = 10;
let messageIdCounter = 0;
let pendingMessages = new Map(); // Track messages awaiting acknowledgment
let messageRetryAttempts = new Map();
let maxMessageRetries = 3;
let onlineStatusCheckInterval = null;
let isOnline = navigator.onLine;
let reconnectDelayMultiplier = 1; // Increases on repeated failures

/**
 * Initialize multiplayer module
 */
export function initMultiplayer() {
    // Generate or retrieve player name
    playerName = localStorage.getItem('playerName') || `Player${Math.floor(Math.random() * 1000)}`;
    localStorage.setItem('playerName', playerName);

    // Setup online/offline detection
    setupOnlineDetection();
}

/**
 * Setup online/offline event detection
 */
function setupOnlineDetection() {
    window.addEventListener('online', () => {
        console.log('Network came back online');
        isOnline = true;
        showNotification('Network connection restored', 'success');

        // Attempt immediate reconnection if we were in multiplayer mode
        if (isMultiplayerMode && !ws && currentRoomCode) {
            console.log('Attempting reconnection after coming online');
            reconnectAttempts = 0; // Reset attempts since network is back
            reconnectToRoom();
        }
    });

    window.addEventListener('offline', () => {
        console.log('Network went offline');
        isOnline = false;
        showNotification('Network connection lost', 'error');
        updateConnectionStatus(false);
    });

    // Periodic online check (every 10 seconds)
    onlineStatusCheckInterval = setInterval(() => {
        const currentlyOnline = navigator.onLine;
        if (currentlyOnline !== isOnline) {
            isOnline = currentlyOnline;
            if (isOnline) {
                console.log('Network detected as back online via polling');
                if (isMultiplayerMode && !ws && currentRoomCode) {
                    reconnectAttempts = Math.max(0, reconnectAttempts - 2); // Give bonus attempts
                    reconnectToRoom();
                }
            }
        }
    }, 10000);
}

/**
 * Connect to WebSocket server with timeout
 */
function connectWebSocket() {
    return new Promise((resolve, reject) => {
        // Set connection state
        connectionState = isReconnecting ? 'reconnecting' : 'connecting';

        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}`;

        // Connection timeout after 10 seconds
        const connectionTimeout = setTimeout(() => {
            if (connectionState !== 'connected') {
                console.error('WebSocket connection timeout');
                if (ws) {
                    ws.close();
                }
                connectionState = 'disconnected';
                updateConnectionStatus(false);
                reject(new Error('Connection timeout'));
            }
        }, 10000);

        try {
            ws = new WebSocket(wsUrl);

            ws.onopen = () => {
                clearTimeout(connectionTimeout);
                console.log('WebSocket connected');
                connectionState = 'connected';
                reconnectAttempts = 0; // Reset reconnect attempts on successful connection
                isReconnecting = false;
                updateConnectionStatus(true);
                startHeartbeat();
                flushMessageQueue(); // Send any queued messages
                resolve();
            };

            ws.onerror = (error) => {
                clearTimeout(connectionTimeout);
                console.error('WebSocket error:', error);
                connectionState = 'disconnected';
                updateConnectionStatus(false);

                // Only reject if this is the initial connection, not a reconnect
                if (!isReconnecting) {
                    reject(error);
                }
            };

            ws.onclose = (event) => {
                clearTimeout(connectionTimeout);
                console.log('WebSocket disconnected', event.code, event.reason);
                connectionState = 'disconnected';
                updateConnectionStatus(false);
                stopHeartbeat();

                // Attempt reconnection with exponential backoff if in multiplayer mode
                if (isMultiplayerMode && !isReconnecting && reconnectAttempts < maxReconnectAttempts) {
                    scheduleReconnect();
                } else if (reconnectAttempts >= maxReconnectAttempts) {
                    console.error('Max reconnection attempts reached');
                    showNotification('Connection lost. Please refresh the page.', 'error');
                }
            };

            ws.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);

                    // Validate message structure
                    if (!data || typeof data !== 'object' || !data.type) {
                        console.error('Invalid message format:', data);
                        return;
                    }

                    // Reset heartbeat counter on any message
                    heartbeatMissed = 0;

                    // Handle special internal messages
                    if (data.type === 'pong') {
                        handlePong(data);
                        return;
                    }

                    if (data.type === 'ack' && data.messageId) {
                        handleMessageAck(data.messageId);
                        return;
                    }

                    // Send acknowledgment for messages that request it
                    if (data.messageId && data.requiresAck) {
                        sendAck(data.messageId);
                    }

                    handleServerMessage(data);
                } catch (e) {
                    console.error('Failed to parse server message:', e, event.data);
                }
            };
        } catch (error) {
            clearTimeout(connectionTimeout);
            console.error('Failed to create WebSocket:', error);
            connectionState = 'disconnected';
            updateConnectionStatus(false);
            reject(error);
        }
    });
}

/**
 * Check if draft state has actually changed (new action occurred)
 */
function hasStateChanged(oldState, newState) {
    if (!oldState) return true; // First state update

    // Compare total number of actions
    const oldTotal = (oldState.blueBans?.length || 0) + (oldState.redBans?.length || 0) +
                     (oldState.bluePicks?.length || 0) + (oldState.redPicks?.length || 0);
    const newTotal = (newState.blueBans?.length || 0) + (newState.redBans?.length || 0) +
                     (newState.bluePicks?.length || 0) + (newState.redPicks?.length || 0);

    return newTotal > oldTotal;
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
                // Mark as sync (no animations) for initial state
                lastKnownDraftState = data.draftState;
                onDraftUpdateCallback(data.draftState, data.team, true);
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
            // Update role assignments if present
            if (data.blueTeamRoles || data.redTeamRoles) {
                if (onRoleAssignmentsUpdateCallback) {
                    onRoleAssignmentsUpdateCallback({
                        blueTeamRoles: data.blueTeamRoles,
                        redTeamRoles: data.redTeamRoles
                    });
                } else {
                    // Store for later when callback is registered
                    pendingRoleAssignments = {
                        blueTeamRoles: data.blueTeamRoles,
                        redTeamRoles: data.redTeamRoles
                    };
                }
            }
            break;

        case 'room_joined':
            currentRoomCode = data.roomCode;
            currentTeam = data.team;
            isHost = data.isHost || false;
            console.log('Room joined - role assignments received:', {
                blueTeamRoles: data.blueTeamRoles,
                redTeamRoles: data.redTeamRoles,
                hasBlueRoles: !!data.blueTeamRoles,
                hasRedRoles: !!data.redTeamRoles
            });
            updateRoomUI(data.roomCode, data.team, true);
            if (onDraftUpdateCallback) {
                // Mark as sync (no animations) when joining/rejoining
                lastKnownDraftState = data.draftState;
                onDraftUpdateCallback(data.draftState, data.team, true);
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
            // Update role assignments if present
            if (data.blueTeamRoles || data.redTeamRoles) {
                console.log('Processing role assignments, callback registered:', !!onRoleAssignmentsUpdateCallback);
                if (onRoleAssignmentsUpdateCallback) {
                    console.log('Calling onRoleAssignmentsUpdateCallback immediately');
                    onRoleAssignmentsUpdateCallback({
                        blueTeamRoles: data.blueTeamRoles,
                        redTeamRoles: data.redTeamRoles
                    });
                } else {
                    // Store for later when callback is registered
                    console.log('Storing pending role assignments for later:', {
                        blueTeamRoles: data.blueTeamRoles,
                        redTeamRoles: data.redTeamRoles
                    });
                    pendingRoleAssignments = {
                        blueTeamRoles: data.blueTeamRoles,
                        redTeamRoles: data.redTeamRoles
                    };
                }
            } else {
                console.log('No role assignments in room_joined message (both null)');
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
                lastKnownDraftState = data.draftState;
                onDraftUpdateCallback(data.draftState, currentTeam, false);
            }
            break;

        case 'draft_update':
            if (onDraftUpdateCallback) {
                // Check if this is actually a new action (not a reconnect sync)
                const isNewAction = hasStateChanged(lastKnownDraftState, data.draftState);
                lastKnownDraftState = data.draftState;
                onDraftUpdateCallback(data.draftState, currentTeam, !isNewAction);
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
                lastKnownDraftState = data.draftState;
                onDraftUpdateCallback(data.draftState, data.team, true);
            }
            // Update room players list if included
            if (data.bluePlayerName !== undefined && onRoomUpdateCallback) {
                onRoomUpdateCallback({
                    bluePlayerName: data.bluePlayerName,
                    redPlayerName: data.redPlayerName,
                    spectators: data.spectators || []
                });
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
            // Update role assignments if present
            if (data.blueTeamRoles || data.redTeamRoles) {
                if (onRoleAssignmentsUpdateCallback) {
                    onRoleAssignmentsUpdateCallback({
                        blueTeamRoles: data.blueTeamRoles,
                        redTeamRoles: data.redTeamRoles
                    });
                } else {
                    // Store for later when callback is registered
                    pendingRoleAssignments = {
                        blueTeamRoles: data.blueTeamRoles,
                        redTeamRoles: data.redTeamRoles
                    };
                }
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

        case 'role_assignments_updated':
            if (onRoleAssignmentsUpdateCallback) {
                onRoleAssignmentsUpdateCallback({
                    blueTeamRoles: data.blueTeamRoles,
                    redTeamRoles: data.redTeamRoles
                });
            }
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
        // Use rejoin_room to preserve team assignment
        sendMessage({
            type: 'rejoin_room',
            roomCode: currentRoomCode,
            team: currentTeam, // Specify which team to rejoin
            playerName: playerName
        });
        showNotification('Reconnected successfully', 'success');
    } catch (error) {
        console.error('Failed to reconnect:', error);
    }
}

/**
 * Schedule reconnection with exponential backoff
 */
function scheduleReconnect() {
    if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
    }

    reconnectAttempts++;
    isReconnecting = true;

    // Exponential backoff: 1s, 2s, 4s, 8s, 16s, 32s (capped at 30s)
    const delay = Math.min(1000 * Math.pow(2, reconnectAttempts - 1), 30000);

    console.log(`Scheduling reconnection attempt ${reconnectAttempts}/${maxReconnectAttempts} in ${delay}ms`);
    showNotification(`Reconnecting in ${Math.ceil(delay / 1000)}s (attempt ${reconnectAttempts}/${maxReconnectAttempts})...`, 'info');

    reconnectTimeout = setTimeout(() => {
        if (currentRoomCode && isMultiplayerMode) {
            console.log('Attempting to reconnect...');
            reconnectToRoom().catch(error => {
                console.error('Reconnection failed:', error);
                // scheduleReconnect will be called again from onclose
            });
        }
    }, delay);
}

/**
 * Start heartbeat monitoring with ping/pong
 */
function startHeartbeat() {
    stopHeartbeat(); // Clear any existing heartbeat

    // Send ping every 15 seconds
    heartbeatInterval = setInterval(() => {
        if (ws && ws.readyState === WebSocket.OPEN) {
            // Check if last pong was received
            const now = Date.now();
            if (lastPingTime > 0 && lastPongTime < lastPingTime) {
                heartbeatMissed++;
                console.warn(`Ping timeout, missed ${heartbeatMissed}/${maxHeartbeatMissed}`);

                if (heartbeatMissed >= maxHeartbeatMissed) {
                    console.error('Heartbeat timeout - connection appears dead');
                    stopHeartbeat();
                    if (ws) {
                        ws.close();
                    }
                    return;
                }
            } else {
                heartbeatMissed = 0;
            }

            // Send ping
            sendPing();
        } else {
            stopHeartbeat();
        }
    }, 15000);

    // Send initial ping
    setTimeout(() => sendPing(), 1000);
}

/**
 * Stop heartbeat monitoring
 */
function stopHeartbeat() {
    if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
        heartbeatInterval = null;
    }
    heartbeatMissed = 0;
    lastPingTime = 0;
    lastPongTime = 0;
}

/**
 * Send ping to measure latency
 */
function sendPing() {
    if (ws && ws.readyState === WebSocket.OPEN) {
        lastPingTime = Date.now();
        try {
            ws.send(JSON.stringify({ type: 'ping', timestamp: lastPingTime }));
        } catch (error) {
            console.error('Failed to send ping:', error);
        }
    }
}

/**
 * Handle pong response from server
 */
function handlePong(data) {
    lastPongTime = Date.now();
    const latency = lastPongTime - (data.timestamp || lastPingTime);

    // Update latency statistics
    latencyHistory.push(latency);
    if (latencyHistory.length > maxLatencyHistory) {
        latencyHistory.shift();
    }

    // Calculate average latency
    averageLatency = Math.round(
        latencyHistory.reduce((sum, l) => sum + l, 0) / latencyHistory.length
    );

    // Update connection quality indicator
    updateConnectionQuality(averageLatency);

    console.log(`Latency: ${latency}ms, Average: ${averageLatency}ms`);
}

/**
 * Update connection quality indicator based on latency
 */
function updateConnectionQuality(latency) {
    const statusElement = document.getElementById('connection-status');
    if (!statusElement || connectionState !== 'connected') return;

    let qualityText = '';
    let qualityClass = '';

    if (latency < 100) {
        qualityText = 'Connected (Excellent)';
        qualityClass = 'quality-excellent';
    } else if (latency < 200) {
        qualityText = 'Connected (Good)';
        qualityClass = 'quality-good';
    } else if (latency < 400) {
        qualityText = 'Connected (Fair)';
        qualityClass = 'quality-fair';
    } else {
        qualityText = 'Connected (Poor)';
        qualityClass = 'quality-poor';
    }

    statusElement.textContent = qualityText;
    statusElement.className = `connection-status connected ${qualityClass}`;
}

/**
 * Send acknowledgment for received message
 */
function sendAck(messageId) {
    if (ws && ws.readyState === WebSocket.OPEN) {
        try {
            ws.send(JSON.stringify({ type: 'ack', messageId: messageId }));
        } catch (error) {
            console.error('Failed to send ack:', error);
        }
    }
}

/**
 * Handle message acknowledgment from server
 */
function handleMessageAck(messageId) {
    if (pendingMessages.has(messageId)) {
        const message = pendingMessages.get(messageId);
        console.log(`Message acknowledged: ${message.type} (id: ${messageId})`);
        pendingMessages.delete(messageId);
        messageRetryAttempts.delete(messageId);
    }
}

/**
 * Queue a message to be sent when connection is restored
 */
function queueMessage(message) {
    messageQueue.push(message);
    console.log('Message queued:', message.type);

    // Limit queue size to prevent memory issues
    if (messageQueue.length > 50) {
        messageQueue.shift(); // Remove oldest message
    }
}

/**
 * Flush queued messages after reconnection
 */
function flushMessageQueue() {
    if (messageQueue.length === 0) return;

    console.log(`Flushing ${messageQueue.length} queued messages`);

    while (messageQueue.length > 0) {
        const message = messageQueue.shift();
        sendMessage(message);
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
 * Update role assignments for both teams
 */
export function updateRoleAssignments(blueTeamRoles, redTeamRoles) {
    sendMessage({
        type: 'update_role_assignments',
        blueTeamRoles: blueTeamRoles,
        redTeamRoles: redTeamRoles
    });
}

/**
 * Send a message to the server with retry logic and acknowledgment tracking
 */
function sendMessage(message, requiresAck = false) {
    // Validate message structure
    if (!message || typeof message !== 'object' || !message.type) {
        console.error('Invalid message format:', message);
        return null;
    }

    // Assign message ID for tracking
    if (!message.messageId) {
        message.messageId = `msg_${++messageIdCounter}_${Date.now()}`;
    }

    // Determine if this is a critical message
    const criticalMessages = ['draft_action', 'start_draft', 'create_room', 'join_room'];
    const isCritical = criticalMessages.includes(message.type);

    if (ws && ws.readyState === WebSocket.OPEN) {
        try {
            // Add requiresAck flag if this is a critical message
            if (isCritical) {
                message.requiresAck = true;
                requiresAck = true;
            }

            ws.send(JSON.stringify(message));
            console.log('Sent message:', message.type, `(id: ${message.messageId})`);

            // Track message if it requires acknowledgment
            if (requiresAck) {
                pendingMessages.set(message.messageId, message);
                messageRetryAttempts.set(message.messageId, 0);

                // Setup retry timeout (5 seconds)
                setTimeout(() => retryMessage(message.messageId), 5000);
            }

            return message.messageId;
        } catch (error) {
            console.error('Failed to send message:', error);
            classifyAndHandleError(error, message);
            queueMessage(message);
            return null;
        }
    } else {
        console.warn('WebSocket not connected, queuing message');

        // Show appropriate notification based on message criticality
        if (isCritical) {
            showNotification('Not connected to server. Reconnecting...', 'error');
        }

        queueMessage(message);
        return null;
    }
}

/**
 * Retry sending a message that wasn't acknowledged
 */
function retryMessage(messageId) {
    if (!pendingMessages.has(messageId)) {
        return; // Message was already acknowledged
    }

    const message = pendingMessages.get(messageId);
    const attempts = messageRetryAttempts.get(messageId) || 0;

    if (attempts >= maxMessageRetries) {
        console.error(`Message retry limit reached for ${message.type} (id: ${messageId})`);
        pendingMessages.delete(messageId);
        messageRetryAttempts.delete(messageId);
        showNotification(`Failed to send ${message.type}. Please try again.`, 'error');
        return;
    }

    if (ws && ws.readyState === WebSocket.OPEN) {
        console.log(`Retrying message ${message.type} (id: ${messageId}), attempt ${attempts + 1}/${maxMessageRetries}`);
        messageRetryAttempts.set(messageId, attempts + 1);

        try {
            ws.send(JSON.stringify(message));
            // Setup another retry timeout
            setTimeout(() => retryMessage(messageId), 5000 * (attempts + 1)); // Exponential backoff
        } catch (error) {
            console.error('Failed to retry message:', error);
            pendingMessages.delete(messageId);
            messageRetryAttempts.delete(messageId);
        }
    } else {
        // Connection lost, queue the message
        pendingMessages.delete(messageId);
        messageRetryAttempts.delete(messageId);
        queueMessage(message);
    }
}

/**
 * Classify network errors and handle appropriately
 */
function classifyAndHandleError(error, message) {
    let errorType = 'unknown';
    let userMessage = 'Network error occurred';

    // Classify error type
    if (error instanceof TypeError) {
        errorType = 'network_error';
        userMessage = 'Network connection issue';
    } else if (error.name === 'InvalidStateError') {
        errorType = 'connection_closed';
        userMessage = 'Connection was closed';
    } else if (error.name === 'SyntaxError') {
        errorType = 'invalid_data';
        userMessage = 'Invalid data format';
    } else if (error.message && error.message.includes('timeout')) {
        errorType = 'timeout';
        userMessage = 'Connection timeout';
    }

    console.error(`Network error [${errorType}]:`, error, 'for message:', message?.type);

    // Handle based on error type
    switch (errorType) {
        case 'network_error':
        case 'connection_closed':
        case 'timeout':
            // These are recoverable - queue the message
            if (message) {
                queueMessage(message);
            }
            // Trigger reconnection if not already attempting
            if (isMultiplayerMode && !isReconnecting && ws?.readyState !== WebSocket.OPEN) {
                scheduleReconnect();
            }
            break;

        case 'invalid_data':
            // This is not recoverable - log and notify
            showNotification('Invalid message format', 'error');
            break;

        default:
            // Unknown error - queue and notify
            if (message) {
                queueMessage(message);
            }
            showNotification(userMessage, 'warning');
    }
}

/**
 * Update room UI
 */
function updateRoomUI(roomCode, team, isJoiner) {
    const roomInfoElement = document.getElementById('multiplayer-room-info');
    const roomCodeElement = document.getElementById('room-code-display');
    const teamBadgeElement = document.getElementById('team-badge');
    const hostBadgeElement = document.getElementById('host-badge');
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
            teamBadgeElement.textContent = team === 'blue' ? 'Blue Team Captain' : 'Red Team Captain';
            teamBadgeElement.className = `team-badge ${team}-team-badge`;
        }
    }

    // Update host badge visibility
    if (hostBadgeElement) {
        if (isHost) {
            hostBadgeElement.classList.remove('hidden');
        } else {
            hostBadgeElement.classList.add('hidden');
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

    // Update start button visibility (only host can start)
    const startDraftBtn = document.getElementById('multiplayer-start-draft-btn');
    if (startDraftBtn) {
        if (isHost) {
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
    const fearlessLabel = document.getElementById('fearless-draft-label-text');
    const fearlessResetBtn = document.getElementById('reset-fearless-session-btn');

    if (fearlessToggle) {
        fearlessToggle.checked = enabled;

        // Update the visual state of the label and button
        if (fearlessLabel) {
            fearlessLabel.classList.toggle('active', enabled);
        }
        if (fearlessResetBtn) {
            fearlessResetBtn.classList.toggle('hidden', !enabled);
        }

        // Dispatch a custom event to notify the draft module
        const event = new CustomEvent('fearlessStateChanged', { detail: { enabled } });
        document.dispatchEvent(event);
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
            // Show more detailed status based on connection state
            switch (connectionState) {
                case 'connecting':
                    statusElement.textContent = 'Connecting...';
                    statusElement.className = 'connection-status connecting';
                    break;
                case 'reconnecting':
                    statusElement.textContent = `Reconnecting (${reconnectAttempts}/${maxReconnectAttempts})...`;
                    statusElement.className = 'connection-status reconnecting';
                    break;
                default:
                    statusElement.textContent = 'Disconnected';
                    statusElement.className = 'connection-status disconnected';
            }
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
 * Register callback for role assignments updates
 */
export function onRoleAssignmentsUpdate(callback) {
    onRoleAssignmentsUpdateCallback = callback;

    // If we have pending role assignments, send them now
    if (pendingRoleAssignments) {
        console.log('Sending pending role assignments to callback');
        callback(pendingRoleAssignments);
        pendingRoleAssignments = null;
    }
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
 * Get current game state
 */
export function getGameState() {
    return gameState;
}

/**
 * Leave room and disconnect
 */
export function leaveRoom() {
    // Stop reconnection attempts
    isMultiplayerMode = false;
    isReconnecting = false;

    // Clear timeouts and intervals
    if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
        reconnectTimeout = null;
    }
    if (onlineStatusCheckInterval) {
        clearInterval(onlineStatusCheckInterval);
        onlineStatusCheckInterval = null;
    }
    stopHeartbeat();

    // Close WebSocket
    if (ws) {
        ws.close();
        ws = null;
    }

    // Reset all state
    currentRoomCode = null;
    currentTeam = null;
    reconnectAttempts = 0;
    messageQueue = [];
    connectionState = 'disconnected';
    reconnectDelayMultiplier = 1;

    // Clear tracking maps
    pendingMessages.clear();
    messageRetryAttempts.clear();

    // Reset latency tracking
    lastPingTime = 0;
    lastPongTime = 0;
    averageLatency = 0;
    latencyHistory = [];

    updateConnectionStatus(false);
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

// --- MAIN APPLICATION LOGIC ---
import { setPlayerPool, getPlayerPool, setRandomizerMode, getRandomizerMode, applyRolePreferences } from './state.js';
import { parseLobbyChat, saveLobbyToStorage, loadLobbyFromStorage } from './parser.js';
import { shuffleArray, validatePlayerCount } from './randomizer.js';
import { showStage, renderConfigUI, setupConfigUIEventListeners } from './ui.js';
import { displayTeams } from './display.js';
import { updateDraftUI, initializeDraft } from './draft.js';

// --- STATE VARIABLES ---
export let playerName = localStorage.getItem('playerName') || '';
export let roomId = null; // Will be set when joining a draft room

// --- WEBSOCKET CONNECTION ---
// Initialize WebSocket only if we're not on a file:// protocol
let socket = null;
const messageQueue = []; // Queue for messages sent before socket is ready

// Helper function to wait for WebSocket to be ready
function waitForSocketReady(timeoutMs = 5000) {
    return new Promise((resolve, reject) => {
        if (!socket) {
            reject(new Error('No WebSocket connection'));
            return;
        }

        if (socket.readyState === WebSocket.OPEN) {
            resolve();
            return;
        }

        const timeout = setTimeout(() => {
            reject(new Error('WebSocket connection timeout'));
        }, timeoutMs);

        const checkReady = () => {
            if (socket.readyState === WebSocket.OPEN) {
                clearTimeout(timeout);
                resolve();
            } else if (socket.readyState === WebSocket.CLOSED || socket.readyState === WebSocket.CLOSING) {
                clearTimeout(timeout);
                reject(new Error('WebSocket connection failed'));
            } else {
                setTimeout(checkReady, 50);
            }
        };
        checkReady();
    });
}

try {
    if (window.location.protocol !== 'file:') {
        // Use wss:// for HTTPS pages, ws:// for HTTP pages
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const urlParams = new URLSearchParams(window.location.search);
        const roomIdFromUrl = urlParams.get('roomId');

        // Append roomId to WebSocket URL if it exists
        const wsUrl = new URL(`${protocol}//${window.location.host}`);
        if (roomIdFromUrl) {
            wsUrl.searchParams.set('roomId', roomIdFromUrl);
        }

        socket = new WebSocket(wsUrl.href);

        socket.onopen = () => {
            console.log('WebSocket connection established.');

            // Send any queued messages
            while (messageQueue.length > 0) {
                const msg = messageQueue.shift();
                socket.send(JSON.stringify(msg));
                console.log('Sent queued message:', msg);
            }

            // Set roomId from URL if present
            const urlParams = new URLSearchParams(window.location.search);
            if (urlParams.has('roomId')) {
                roomId = urlParams.get('roomId');
            }
        };

        socket.onmessage = (event) => {
            try {
                const message = JSON.parse(event.data);
                console.log('Message from server:', message);

                switch (message.type) {
                    case 'draft_update':
                        updateDraftUI(message.gameState);
                        break;
                    case 'pick_rejected':
                        alert(`Pick Rejected: ${message.champion} - ${message.reason}`);
                        break;
                    case 'notification':
                        alert(message.message);
                        break;
                    case 'error':
                        alert(`Error: ${message.message}`);
                        break;
                }
            } catch (error) {
                console.log('Non-JSON message from server:', event.data);
            }
        };

        socket.onclose = () => {
            console.log('WebSocket connection closed.');
        };

        socket.onerror = (error) => {
            console.warn('WebSocket error:', error);
        };
    } else {
        console.warn('File protocol detected. WebSocket features (draft mode) will be unavailable.');
    }
} catch (error) {
    console.warn('WebSocket initialization warning:', error);
}

export { socket };


// --- CLIPBOARD HELPER ---
/**
 * Copies text to clipboard with fallback for non-HTTPS contexts
 * @param {string} text - Text to copy
 * @returns {Promise<boolean>} - Whether the copy was successful
 */
async function copyToClipboard(text) {
    // Try modern clipboard API first (requires HTTPS or localhost)
    if (navigator.clipboard && navigator.clipboard.writeText) {
        try {
            await navigator.clipboard.writeText(text);
            return true;
        } catch (err) {
            console.warn('Clipboard API failed, trying fallback:', err);
        }
    }

    // Fallback for non-HTTPS contexts
    try {
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.style.position = 'fixed';
        textArea.style.left = '-9999px';
        textArea.style.top = '-9999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();

        const successful = document.execCommand('copy');
        document.body.removeChild(textArea);

        if (successful) {
            return true;
        } else {
            throw new Error('execCommand copy failed');
        }
    } catch (err) {
        console.error('Failed to copy text:', err);
        return false;
    }
}


// --- CHAMPION API ---
/**
 * Fetches the list of champions from the backend API
 * @returns {Promise<Array>} - Array of champion objects or empty array
 */
export async function fetchChampionList() {
    // Skip champion fetch if running from file:// protocol
    if (window.location.protocol === 'file:') {
        console.warn('File protocol detected. Champion list will not be loaded.');
        return [];
    }

    try {
        const response = await fetch('/api/champions');
        if (!response.ok) {
            throw new Error(`Failed to fetch champions: ${response.status}`);
        }
        const champions = await response.json();
        console.log('Champions loaded:', champions.length, 'champions');
        return champions;
    } catch (error) {
        console.error('Error fetching champions:', error);
        console.warn('Draft mode may not be fully available. Will retry...');

        // Retry after a short delay
        await new Promise(resolve => setTimeout(resolve, 2000));
        try {
            const response = await fetch('/api/champions');
            if (!response.ok) {
                throw new Error(`Failed to fetch champions on retry: ${response.status}`);
            }
            const champions = await response.json();
            console.log('Champions loaded on retry:', champions.length, 'champions');
            return champions;
        } catch (retryError) {
            console.error('Error fetching champions on retry:', retryError);
            console.warn('Draft mode will not be available without champion data.');
            return [];
        }
    }
}

// Export socket for use in other modules

/**
 * Safely sends a WebSocket message, queuing if not yet connected
 * @param {Object} message - The message object to send
 */
export function sendSocketMessage(message) {
    if (!socket) {
        console.error('WebSocket not initialized. Message not sent:', message);
        return false;
    }

    if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify(message));
        console.log('Sent message:', message.type);
        return true;
    } else if (socket.readyState === WebSocket.CONNECTING) {
        // Queue the message to send when socket opens
        messageQueue.push(message);
        console.log('WebSocket connecting, message queued:', message.type);
        return true;
    } else {
        console.error(`WebSocket not connected (state: ${socket.readyState}). Message not sent:`, message);
        return false;
    }
}

/**
 * Prompt the user for a display name if one isn't set yet.
 * @param {boolean} forcePrompt - If true, always prompt even if name exists
 * Returns true if a name is set (existing or newly provided), false if the user cancelled.
 */
export async function promptForNameIfNeeded(forcePrompt = false) {
    // If not forcing prompt and name already exists, return true
    if (!forcePrompt && playerName && playerName.trim() !== '') return true;

    // Get current name or default to empty string for prompt
    const currentName = playerName && playerName.trim() !== '' ? playerName : '';

    const name = window.prompt('Enter your display name:', currentName || 'Guest');
    if (name && name.trim() !== '') {
        playerName = name.trim();
        localStorage.setItem('playerName', playerName);
        // If the input exists in the DOM, update it
        const playerNameInput = document.getElementById('player-name-input');
        if (playerNameInput) playerNameInput.value = playerName;
        return true;
    }
    return false;
}


/**
 * Runs the team randomization
 * @returns {boolean} - Whether randomization was successful
 */
function runRandomization() {
    const players = getPlayerPool();
    const mode = getRandomizerMode();

    // Validate player count
    const validation = validatePlayerCount(players.length, mode);
    if (!validation.valid) {
        alert(validation.message);
        return false;
    }

    // Shuffle players using Fisher-Yates algorithm
    const shuffledPlayers = shuffleArray(players);

    if (mode === '5man') {
        // For 5man mode, take up to 5 players
        const team = shuffledPlayers.slice(0, 5);
        displayTeams(team, null);
        return true;
    } else {
        // For 5v5 mode, split players into two teams
        const midPoint = Math.ceil(shuffledPlayers.length / 2);
        const team1 = shuffledPlayers.slice(0, midPoint);
        const team2 = shuffledPlayers.slice(midPoint);
        displayTeams(team1, team2);
        return true;
    }
}

/**
 * Handles the randomization button click
 */
function handleRandomization() {
    if (runRandomization()) {
        showStage(3);
        updateButtonVisibility();
    }
}

/**
 * Updates button visibility based on mode
 */
function updateButtonVisibility() {
    const mode = getRandomizerMode();
    const rerollBtn = document.getElementById('reroll-btn');
    const proceedToDraftBtn = document.getElementById('proceed-to-draft-btn');

    if (mode === '5v5') {
        // 5v5 Custom mode: show Proceed to Draft button, hide Reroll
        rerollBtn.classList.add('hidden');
        proceedToDraftBtn.classList.remove('hidden');
    } else {
        // 5man mode: show Reroll button, hide Draft buttons
        rerollBtn.classList.remove('hidden');
        proceedToDraftBtn.classList.add('hidden');
    }
}

/**
 * Starts the draft and navigates to Stage 4
 */
async function handleStartDraft() {
    // Check if WebSocket is available
    if (!socket) {
        alert('Draft mode requires a backend server. Please start the server to use draft features.\n\nThe basic team randomizer will continue to work without a server.');
        return;
    }

    // Prompt for name if not set (don't force if already exists)
    const ok = await promptForNameIfNeeded();
    if (!ok) return;

    // If we don't have a roomId yet, request one from the server FIRST
    if (!roomId) {
        try {
            const response = await fetch('/api/draft/default-room');
            if (!response.ok) throw new Error('Failed to get room ID');
            const data = await response.json();
            roomId = data.roomId;
            console.log('Got room ID:', roomId);
        } catch (error) {
            console.error('Failed to get room ID:', error);
            alert('Failed to connect to draft server.');
            return;
        }
    }

    // Navigate to draft stage
    showStage(4);

    // Wait for WebSocket to be ready
    try {
        console.log('Ensuring WebSocket is ready...');
        await waitForSocketReady(5000);
        console.log('WebSocket is ready!');
    } catch (error) {
        console.error('WebSocket not ready:', error);
        alert('Failed to connect to server. Please refresh and try again.');
        showStage(3);
        return;
    }

    // Connect to room and start draft
    sendSocketMessage({
        type: 'connect_to_room',
        roomId: roomId
    });

    sendSocketMessage({
        type: 'start_draft',
        roomId: roomId
    });

    // Initialize draft UI AFTER roomId is set and messages are sent
    try {
        await initializeDraft();
    } catch (error) {
        console.error('Failed to initialize draft:', error);
        alert('Failed to initialize draft. Please check the console for details.');
        showStage(3); // Go back to teams display
        return;
    }
}

/**
 * Initializes all event listeners
 */
function initializeEventListeners() {
    // Player name input handler
    const playerNameInput = document.getElementById('player-name-input');
    if (playerNameInput) {
        playerNameInput.value = playerName;
        playerNameInput.addEventListener('change', (e) => {
            playerName = e.target.value;
            localStorage.setItem('playerName', playerName);
        });
    }

    // Share link buttons
    const shareBlueBtn = document.getElementById('share-blue-link-btn');
    const shareRedBtn = document.getElementById('share-red-link-btn');

    if (shareBlueBtn) {
        shareBlueBtn.addEventListener('click', async (e) => {
            e.preventDefault();

            // Check if roomId is set
            if (!roomId) {
                alert('Cannot generate link: Room ID not available. Please try starting the draft again.');
                return;
            }

            // Ensure host has a name
            const ok = await promptForNameIfNeeded();
            if (!ok) return;

            // Generate URL
            const url = new URL(window.location.href);
            url.searchParams.set('roomId', roomId);
            url.searchParams.set('team', 'blue');
            url.searchParams.set('isCaptain', 'true');
            const urlString = url.toString();

            // Try to copy - with fallback to show the link if copy fails
            try {
                // Try modern clipboard API first
                if (navigator.clipboard && navigator.clipboard.writeText) {
                    await navigator.clipboard.writeText(urlString);
                    alert('Blue team captain link copied to clipboard!\n\nYou are now the Red team captain.');
                } else {
                    // Fallback method
                    const textArea = document.createElement('textarea');
                    textArea.value = urlString;
                    textArea.style.position = 'fixed';
                    textArea.style.left = '-9999px';
                    document.body.appendChild(textArea);
                    textArea.select();
                    const successful = document.execCommand('copy');
                    document.body.removeChild(textArea);

                    if (successful) {
                        alert('Blue team captain link copied to clipboard!\n\nYou are now the Red team captain.');
                    } else {
                        throw new Error('Copy failed');
                    }
                }
            } catch (err) {
                console.error('Clipboard copy failed:', err);
                // Show a prompt with the URL so user can copy manually
                prompt('Please copy this link manually (Ctrl+C):', urlString);
            }

            // Make host the red team captain
            sendSocketMessage({
                type: 'join_team',
                team: 'red',
                playerName: playerName,
                isCaptain: true
            });
        });
    }

    if (shareRedBtn) {
        shareRedBtn.addEventListener('click', async (e) => {
            e.preventDefault();

            // Check if roomId is set
            if (!roomId) {
                alert('Cannot generate link: Room ID not available. Please try starting the draft again.');
                return;
            }

            // Ensure host has a name
            const ok = await promptForNameIfNeeded();
            if (!ok) return;

            // Generate URL
            const url = new URL(window.location.href);
            url.searchParams.set('roomId', roomId);
            url.searchParams.set('team', 'red');
            url.searchParams.set('isCaptain', 'true');
            const urlString = url.toString();

            // Try to copy - with fallback to show the link if copy fails
            try {
                // Try modern clipboard API first
                if (navigator.clipboard && navigator.clipboard.writeText) {
                    await navigator.clipboard.writeText(urlString);
                    alert('Red team captain link copied to clipboard!\n\nYou are now the Blue team captain.');
                } else {
                    // Fallback method
                    const textArea = document.createElement('textarea');
                    textArea.value = urlString;
                    textArea.style.position = 'fixed';
                    textArea.style.left = '-9999px';
                    document.body.appendChild(textArea);
                    textArea.select();
                    const successful = document.execCommand('copy');
                    document.body.removeChild(textArea);

                    if (successful) {
                        alert('Red team captain link copied to clipboard!\n\nYou are now the Blue team captain.');
                    } else {
                        throw new Error('Copy failed');
                    }
                }
            } catch (err) {
                console.error('Clipboard copy failed:', err);
                // Show a prompt with the URL so user can copy manually
                prompt('Please copy this link manually (Ctrl+C):', urlString);
            }

            // Make host the blue team captain
            sendSocketMessage({
                type: 'join_team',
                team: 'blue',
                playerName: playerName,
                isCaptain: true
            });
        });
    }

    // Team join buttons
    const joinBlueTeamBtn = document.getElementById('join-blue-team-btn');
    const joinRedTeamBtn = document.getElementById('join-red-team-btn');
    
    if (joinBlueTeamBtn) {
        joinBlueTeamBtn.addEventListener('click', async () => {
            const ok = await promptForNameIfNeeded();
            if (!ok) return;
            await handleStartDraft();
            sendSocketMessage({
                type: 'join_team',
                team: 'blue',
                playerName: playerName,
                isCaptain: false
            });
        });
    }

    if (joinRedTeamBtn) {
        joinRedTeamBtn.addEventListener('click', async () => {
            const ok = await promptForNameIfNeeded();
            if (!ok) return;
            await handleStartDraft();
            sendSocketMessage({
                type: 'join_team',
                team: 'red',
                playerName: playerName,
                isCaptain: false
            });
        });
    }

    // Parse button - Stage 1 -> Stage 2
    document.getElementById('parse-btn').addEventListener('click', () => {
        const chatInput = document.getElementById('chat-input');
        const inputText = chatInput.value;

        saveLobbyToStorage(inputText);
        const players = parseLobbyChat(inputText);

        if (players.length < 2) {
            alert("Could not find at least two players in the lobby text.");
            return;
        }

        setPlayerPool(players);
        applyRolePreferences(); // Apply saved role preferences for these players
        renderConfigUI();
        showStage(2);
    });

    // Back button - Stage 2 -> Stage 1
    document.getElementById('back-btn').addEventListener('click', () => {
        showStage(1);
    });

    // Randomize button - Stage 2 -> Stage 3
    document.getElementById('randomize-btn').addEventListener('click', handleRandomization);

    // Edit players button - Stage 3 -> Stage 2
    document.getElementById('edit-players-btn').addEventListener('click', () => {
        showStage(2);
    });

    // Reroll button - Stays on Stage 3
    document.getElementById('reroll-btn').addEventListener('click', handleRandomization);

    // Proceed to Draft button - Stage 3 -> Stage 4 (host) or Stage 5 (guest)
    document.getElementById('proceed-to-draft-btn').addEventListener('click', async () => {
        const isHost = true; // As the creator of the lobby, you are the host
        if (isHost) {
            // Prompt handled in handleStartDraft
            await handleStartDraft(); // Go directly to draft stage

            // Make host the blue team captain
            sendSocketMessage({
                type: 'join_team',
                team: 'blue',
                playerName: playerName,
                isCaptain: true
            });
        } else {
            showStage(5); // Show team selection for guests
        }
    });

    // Player configuration event listeners
    setupConfigUIEventListeners();

    // Bravery Mode event listeners
    const braveryToggle = document.getElementById('bravery-mode-checkbox');
    const braveryResetBtn = document.getElementById('reset-bravery-session-btn');

    // Ensure toggle is off on page load
    braveryToggle.checked = false;

    braveryToggle.addEventListener('change', (e) => {
        const isEnabled = e.target.checked;
        const labelText = document.getElementById('bravery-mode-label-text');

        labelText.classList.toggle('active', isEnabled);

        if (isEnabled) {
            braveryResetBtn.classList.remove('hidden');
        } else {
            braveryResetBtn.classList.add('hidden');
        }
        sendSocketMessage({
            type: 'set_bravery_mode',
            enabled: isEnabled,
            playerName: playerName
        });
    });

    braveryResetBtn.addEventListener('click', () => {
        if (confirm('Are you sure you want to reset the Bravery Mode session? This will clear all used champions.')) {
            sendSocketMessage({
                type: 'reset_bravery_session',
                playerName: playerName
            });
        }
    });

    // Post-draft button listeners
    const draftNewDraftBtn = document.getElementById('draft-new-draft-btn');
    if (draftNewDraftBtn) {
        draftNewDraftBtn.addEventListener('click', handleStartDraft);
    }

    const draftEditPlayersBtn = document.getElementById('draft-edit-players-btn');
    if (draftEditPlayersBtn) {
        draftEditPlayersBtn.addEventListener('click', () => showStage(2));
    }

    // Begin Draft button (visible to captains) - puts draft into progress
    const beginDraftBtn = document.getElementById('begin-draft-btn');
    if (beginDraftBtn) {
        beginDraftBtn.addEventListener('click', async () => {
            const ok = await promptForNameIfNeeded();
            if (!ok) return;

            // Notify server to mark draft as in-progress
            sendSocketMessage({
                type: 'begin_draft',
                roomId: roomId,
                initiatedBy: playerName
            });

            // Initialize draft locally
            showStage(4);
            await initializeDraft();
        });
    }
}

/**
 * Initializes the mode switch (5man vs 5v5)
 */
function initializeModeSwitch() {
    const modeSwitch = document.getElementById('mode-switch-checkbox');
    const label5v5 = document.getElementById('mode-label-5v5');
    const label5man = document.getElementById('mode-label-5man');
    const labelText5v5 = label5v5.querySelector('.switch-label-text');
    const labelText5man = label5man.querySelector('.switch-label-text');
    const mode = getRandomizerMode();

    // Set initial switch state
    modeSwitch.checked = mode === '5v5';

    // Set initial label states
    if (mode === '5v5') {
        labelText5v5.classList.add('active');
        labelText5man.classList.remove('active');
    } else {
        labelText5man.classList.add('active');
        labelText5v5.classList.remove('active');
    }

    // Mode switch event listener
    modeSwitch.addEventListener('change', (e) => {
        if (e.target.checked) {
            setRandomizerMode('5v5');
            labelText5v5.classList.add('active');
            labelText5man.classList.remove('active');
        } else {
            setRandomizerMode('5man');
            labelText5man.classList.add('active');
            labelText5v5.classList.remove('active');
        }
        // Update button visibility if on Stage 3
        const stage3 = document.getElementById('stage-three-display');
        if (!stage3.classList.contains('hidden')) {
            updateButtonVisibility();
        }
    });
}

/**
 * Initializes the application on page load
 */
async function init() {
    // Check URL parameters for direct draft join
    const urlParams = new URLSearchParams(window.location.search);
    const joinRoomId = urlParams.get('roomId');
    const joinTeam = urlParams.get('team');
    const isJoiningAsCaptain = urlParams.get('isCaptain') === 'true';

    if (joinRoomId && joinTeam) {
        // We're joining an existing draft via shared link
        roomId = joinRoomId;

        // ALWAYS prompt for display name when joining via link
        const ok = await promptForNameIfNeeded(true); // Force prompt
        if (!ok) {
            // If user cancelled, return to initial stage
            showStage(1);
            return; // Skip normal initialization
        }

        // Wait for WebSocket to be ready before proceeding
        if (socket) {
            try {
                console.log('Waiting for WebSocket to connect...');
                await waitForSocketReady(10000); // Wait up to 10 seconds
                console.log('WebSocket ready!');
            } catch (error) {
                console.error('WebSocket connection failed:', error);
                alert('Failed to connect to server. Please refresh and try again.');
                showStage(1);
                return;
            }
        }

        // Skip to draft stage
        showStage(4);

        // Initialize draft UI
        await initializeDraft();

        // Join the specified team with the provided name
        sendSocketMessage({
            type: 'join_team',
            team: joinTeam,
            playerName: playerName,
            isCaptain: isJoiningAsCaptain
        });

        return; // Skip normal initialization
    }

    // Normal initialization for new sessions
    const savedLobby = loadLobbyFromStorage();
    if (savedLobby) {
        const chatInput = document.getElementById('chat-input');
        chatInput.value = savedLobby;
    }

    // Fetch champion list from backend
    await fetchChampionList();

    // Show initial stage
    showStage(1);

    // Initialize event listeners
    initializeEventListeners();
}

// Initialize app only when DOM is ready to avoid race conditions
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        initializeModeSwitch();
        init();
    });
} else {
    // Handle case where DOMContentLoaded has already fired
    initializeModeSwitch();
    init();
}

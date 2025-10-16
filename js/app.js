// --- MAIN APPLICATION LOGIC ---
import { setPlayerPool, getPlayerPool, setRandomizerMode, getRandomizerMode, applyRolePreferences } from './state.js';
import { parseLobbyChat, saveLobbyToStorage, loadLobbyFromStorage } from './parser.js';
import { shuffleArray, validatePlayerCount } from './randomizer.js';
import { showStage, renderConfigUI, setupConfigUIEventListeners } from './ui.js';
import { displayTeams } from './display.js';
import { initializeDraft } from './draft.js';
import * as Multiplayer from './multiplayer.js';

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
        // 5v5 Custom mode: show both Reroll and Proceed to Draft buttons
        rerollBtn.classList.remove('hidden');
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
    // Navigate to draft stage
    showStage(4);

    // Show multiplayer mode selection
    const multiplayerSetup = document.getElementById('multiplayer-setup');
    if (multiplayerSetup) {
        multiplayerSetup.classList.remove('hidden');
    }
}

/**
 * Start solo draft mode
 */
async function startSoloDraft() {
    try {
        await initializeDraft('solo');
        // Hide multiplayer setup UI
        const multiplayerSetup = document.getElementById('multiplayer-setup');
        if (multiplayerSetup) {
            multiplayerSetup.classList.add('hidden');
        }
    } catch (error) {
        console.error('Failed to initialize draft:', error);
        alert('Failed to initialize draft. Please check the console for details.');
        showStage(3);
    }
}

/**
 * Show multiplayer room options
 */
function showMultiplayerOptions() {
    const roomSelection = document.getElementById('room-selection');
    if (roomSelection) {
        roomSelection.classList.remove('hidden');
    }
}

/**
 * Create a multiplayer room
 */
async function createMultiplayerRoom() {
    const success = await Multiplayer.createRoom();
    if (success) {
        try {
            await initializeDraft('multiplayer', 'blue');
        } catch (error) {
            console.error('Failed to initialize draft:', error);
            alert('Failed to initialize draft. Please check the console for details.');
        }
    }
}

/**
 * Join a multiplayer room
 */
async function joinMultiplayerRoom() {
    const roomCodeInput = document.getElementById('room-code-input');
    const roomCode = roomCodeInput.value.trim().toUpperCase();

    if (!roomCode || roomCode.length !== 6) {
        alert('Please enter a valid 6-character room code');
        return;
    }

    const success = await Multiplayer.joinRoom(roomCode);
    if (success) {
        try {
            await initializeDraft('multiplayer', Multiplayer.getCurrentTeam());
        } catch (error) {
            console.error('Failed to initialize draft:', error);
            alert('Failed to initialize draft. Please check the console for details.');
        }
    }
}

/**
 * Direct join from start screen
 */
async function directJoinRoom() {
    const roomCodeInput = document.getElementById('direct-join-room-code');
    const roomCode = roomCodeInput.value.trim().toUpperCase();

    if (!roomCode || roomCode.length !== 6) {
        alert('Please enter a valid 6-character room code');
        return;
    }

    const success = await Multiplayer.joinRoom(roomCode);
    if (success) {
        try {
            // Skip to stage 4 (draft)
            showStage(4);
            await initializeDraft('multiplayer', Multiplayer.getCurrentTeam());
        } catch (error) {
            console.error('Failed to initialize draft:', error);
            alert('Failed to initialize draft. Please check the console for details.');
            showStage(1);
        }
    }
}

/**
 * Updates the room players list UI
 */
function updateRoomPlayersList(bluePlayerName, redPlayerName, spectators) {
    const bluePlayerElement = document.getElementById('blue-player-name');
    const redPlayerElement = document.getElementById('red-player-name');
    const spectatorsListElement = document.getElementById('spectators-list');

    if (bluePlayerElement) {
        bluePlayerElement.textContent = bluePlayerName || '-';
    }

    if (redPlayerElement) {
        redPlayerElement.textContent = redPlayerName || '-';
    }

    if (spectatorsListElement) {
        if (spectators && spectators.length > 0) {
            spectatorsListElement.textContent = spectators.join(', ');
        } else {
            spectatorsListElement.textContent = 'None';
        }
    }
}

/**
 * Updates the team switcher preview label
 */
function updateTeamSwitcherPreview(selectedTeam, currentTeam) {
    const previewElement = document.getElementById('team-switcher-preview');
    if (!previewElement) return;

    // Remove all preview classes
    previewElement.classList.remove('no-change', 'blue-preview', 'red-preview', 'spectator-preview');

    if (selectedTeam === currentTeam) {
        previewElement.textContent = 'No changes';
        previewElement.classList.add('no-change');
    } else {
        const teamLabels = {
            'blue': 'Switch to Blue Team',
            'red': 'Switch to Red Team',
            'spectator': 'Switch to Spectator'
        };
        previewElement.textContent = teamLabels[selectedTeam] || 'Unknown';
        previewElement.classList.add(`${selectedTeam}-preview`);
    }
}

/**
 * Initializes all event listeners
 */
function initializeEventListeners() {
    // Parse button - Stage 1 -> Stage 2
    document.getElementById('parse-btn').addEventListener('click', () => {
        const chatInput = document.getElementById('chat-input');
        const inputText = chatInput.value;

        saveLobbyToStorage(inputText);
        const players = parseLobbyChat(inputText);

        if (players.length < 1) {
            alert("Could not find at least one player in the lobby text.");
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

    // Proceed to Draft button - Stage 3 -> Stage 4
    document.getElementById('proceed-to-draft-btn').addEventListener('click', handleStartDraft);

    // Player configuration event listeners
    setupConfigUIEventListeners();

    // Post-draft button listeners
    const draftNewDraftBtn = document.getElementById('draft-new-draft-btn');
    if (draftNewDraftBtn) {
        draftNewDraftBtn.addEventListener('click', handleStartDraft);
    }

    const draftEditPlayersBtn = document.getElementById('draft-edit-players-btn');
    if (draftEditPlayersBtn) {
        draftEditPlayersBtn.addEventListener('click', () => showStage(2));
    }

    // Multiplayer mode selection
    const soloDraftBtn = document.getElementById('solo-draft-btn');
    if (soloDraftBtn) {
        soloDraftBtn.addEventListener('click', startSoloDraft);
    }

    const multiplayerDraftBtn = document.getElementById('multiplayer-draft-btn');
    if (multiplayerDraftBtn) {
        multiplayerDraftBtn.addEventListener('click', showMultiplayerOptions);
    }

    // Multiplayer room management
    const createRoomBtn = document.getElementById('create-room-btn');
    if (createRoomBtn) {
        createRoomBtn.addEventListener('click', createMultiplayerRoom);
    }

    const joinRoomBtn = document.getElementById('join-room-btn');
    if (joinRoomBtn) {
        joinRoomBtn.addEventListener('click', joinMultiplayerRoom);
    }

    // Room code copy button
    const copyRoomCodeBtn = document.getElementById('copy-room-code-btn');
    if (copyRoomCodeBtn) {
        copyRoomCodeBtn.addEventListener('click', () => {
            const roomCode = Multiplayer.getRoomCode();
            if (roomCode) {
                navigator.clipboard.writeText(roomCode).then(() => {
                    alert(`Room code ${roomCode} copied to clipboard!`);
                }).catch(err => {
                    console.error('Failed to copy:', err);
                });
            }
        });
    }

    // Multiplayer start draft button
    const multiplayerStartDraftBtn = document.getElementById('multiplayer-start-draft-btn');
    if (multiplayerStartDraftBtn) {
        multiplayerStartDraftBtn.addEventListener('click', () => {
            Multiplayer.startDraft();
        });
    }

    // Allow Enter key to join room
    const roomCodeInput = document.getElementById('room-code-input');
    if (roomCodeInput) {
        roomCodeInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                joinMultiplayerRoom();
            }
        });
        // Auto-uppercase input
        roomCodeInput.addEventListener('input', (e) => {
            e.target.value = e.target.value.toUpperCase();
        });
    }

    // Team switcher - preview selection
    const teamSwitcher = document.getElementById('team-switcher');
    const teamSwitcherConfirmBtn = document.getElementById('team-switcher-confirm-btn');
    const teamSwitcherPreview = document.getElementById('team-switcher-preview');

    if (teamSwitcher && teamSwitcherConfirmBtn && teamSwitcherPreview) {
        // Update preview when selection changes
        teamSwitcher.addEventListener('change', (e) => {
            const selectedTeam = e.target.value;
            const currentTeam = Multiplayer.getCurrentTeam();
            updateTeamSwitcherPreview(selectedTeam, currentTeam);

            // Show/hide confirm button
            if (selectedTeam !== currentTeam) {
                teamSwitcherConfirmBtn.classList.remove('hidden');
            } else {
                teamSwitcherConfirmBtn.classList.add('hidden');
            }
        });

        // Confirm button - actually switch teams
        teamSwitcherConfirmBtn.addEventListener('click', () => {
            const selectedTeam = teamSwitcher.value;
            const currentTeam = Multiplayer.getCurrentTeam();
            if (selectedTeam !== currentTeam) {
                Multiplayer.switchTeam(selectedTeam);
                teamSwitcherConfirmBtn.classList.add('hidden');
                updateTeamSwitcherPreview(selectedTeam, selectedTeam);
            }
        });
    }

    // Register callback for room updates
    Multiplayer.onRoomUpdate((data) => {
        updateRoomPlayersList(data.bluePlayerName, data.redPlayerName, data.spectators);
    });

    // Direct join from start screen
    const directJoinBtn = document.getElementById('direct-join-btn');
    if (directJoinBtn) {
        directJoinBtn.addEventListener('click', directJoinRoom);
    }

    // Direct join room code input
    const directJoinRoomCode = document.getElementById('direct-join-room-code');
    if (directJoinRoomCode) {
        // Allow Enter key to join room
        directJoinRoomCode.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                directJoinRoom();
            }
        });
        // Auto-uppercase input
        directJoinRoomCode.addEventListener('input', (e) => {
            e.target.value = e.target.value.toUpperCase();
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
    // Initialize multiplayer module
    Multiplayer.initMultiplayer();

    // Normal initialization for new sessions
    const savedLobby = loadLobbyFromStorage();
    if (savedLobby) {
        const chatInput = document.getElementById('chat-input');
        chatInput.value = savedLobby;
    }

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
// --- MAIN APPLICATION LOGIC ---
import { setPlayerPool, getPlayerPool, setRandomizerMode, getRandomizerMode, applyRolePreferences } from './state.js';
import { parseLobbyChat, saveLobbyToStorage, loadLobbyFromStorage } from './parser.js';
import { shuffleArray, validatePlayerCount } from './randomizer.js';
import { showStage, renderConfigUI, setupConfigUIEventListeners } from './ui.js';
import { displayTeams } from './display.js';
import { initializeDraft } from './draft.js';

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

    // Initialize draft UI
    try {
        await initializeDraft();
    } catch (error) {
        console.error('Failed to initialize draft:', error);
        alert('Failed to initialize draft. Please check the console for details.');
        showStage(3); // Go back to teams display
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
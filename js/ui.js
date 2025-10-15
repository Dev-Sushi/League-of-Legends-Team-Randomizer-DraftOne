// --- UI RENDERING AND DOM MANIPULATION ---
import { getPlayerPool, getAllRoles, updatePlayerRoles, removePlayer } from './state.js';

/**
 * Shows the specified stage and hides others
 * @param {number} stage - Stage number (1, 2, 3, or 4)
 */
export function showStage(stage) {
    const stageOneDiv = document.getElementById('stage-one-parse');
    const stageTwoDiv = document.getElementById('stage-two-configure');
    const stageThreeDiv = document.getElementById('stage-three-display');
    const stageFourDiv = document.getElementById('stage-four-draft');
    const stageFiveDiv = document.getElementById('stage-five-team-selection');
    const instructionsText = document.getElementById('instructions-text');
    const modeToggle = document.getElementById('mode-toggle');

    const stages = [stageOneDiv, stageTwoDiv, stageThreeDiv, stageFourDiv, stageFiveDiv];
    const stageInstructions = {
        1: "Paste your lobby chat below to get the list of players.",
        2: "Select the roles each player can play, then randomize the teams.",
        3: "The teams are set! Reroll or edit the player list below.",
        4: "Draft your champions! Click on a champion to ban or pick.",
        5: "Choose your team and enter your name to join the draft."
    };

    instructionsText.innerHTML = stageInstructions[stage] || "";

    stages.forEach((div, index) => {
        if (index + 1 === stage) {
            div.classList.remove('hidden');
        } else {
            div.classList.add('hidden');
        }
    });

    // Hide mode toggle on draft screen (stage 4 and 5)
    if (modeToggle) {
        if (stage === 4 || stage === 5) {
            modeToggle.classList.add('hidden');
        } else {
            modeToggle.classList.remove('hidden');
        }
    }
}

/**
 * Renders the player configuration UI
 */
export function renderConfigUI() {
    const playerConfigContainer = document.getElementById('player-config-container');
    const playerPool = getPlayerPool();
    const ALL_ROLES = getAllRoles();

    // Use DocumentFragment for better performance
    const fragment = document.createDocumentFragment();

    playerPool.forEach(player => {
        const row = document.createElement('div');
        row.className = 'player-config-row';

        // Create player name span
        const nameSpan = document.createElement('span');
        nameSpan.className = 'player-name';
        nameSpan.textContent = player.name;

        // Create role selector container
        const roleSelector = document.createElement('div');
        roleSelector.className = 'role-selector';
        roleSelector.dataset.playerName = player.name; // Set data attribute safely

        // Create role buttons
        ALL_ROLES.forEach(role => {
            const button = document.createElement('button');
            button.className = 'role-button' + (player.roles.includes(role) ? ' selected' : '');
            button.dataset.role = role;

            const icon = document.createElement('div');
            icon.className = 'role-icon';

            button.appendChild(icon);
            button.appendChild(document.createTextNode(role));
            roleSelector.appendChild(button);
        });

        // Create remove button
        const removeBtn = document.createElement('button');
        removeBtn.className = 'remove-player-btn';
        removeBtn.dataset.playerName = player.name; // Set data attribute safely
        removeBtn.innerHTML = '&times;';

        // Assemble the row
        row.appendChild(nameSpan);
        row.appendChild(roleSelector);
        row.appendChild(removeBtn);
        fragment.appendChild(row);
    });

    playerConfigContainer.innerHTML = '';
    playerConfigContainer.appendChild(fragment);
}

/**
 * Escapes HTML to prevent XSS
 * @param {string} str - String to escape
 * @returns {string} - Escaped string
 */
function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

/**
 * Sets up event listeners for player configuration UI
 */
export function setupConfigUIEventListeners() {
    const playerConfigContainer = document.getElementById('player-config-container');

    playerConfigContainer.addEventListener('click', (e) => {
        const roleButton = e.target.closest('.role-button');
        if (roleButton) {
            const playerName = roleButton.parentElement.dataset.playerName;
            const role = roleButton.dataset.role;

            roleButton.classList.toggle('selected');
            updatePlayerRoles(playerName, role);
            return;
        }

        const removeButton = e.target.closest('.remove-player-btn');
        if (removeButton) {
            const playerName = removeButton.dataset.playerName;
            removePlayer(playerName);
            renderConfigUI();
        }
    });
}

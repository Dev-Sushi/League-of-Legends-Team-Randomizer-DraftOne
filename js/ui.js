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
        row.innerHTML = `
            <span class="player-name">${escapeHtml(player.name)}</span>
            <div class="role-selector" data-player-name="${escapeHtml(player.name)}">
                ${ALL_ROLES.map(role => `
                    <button class="role-button ${player.roles.includes(role) ? 'selected' : ''}" data-role="${role}">
                        <div class="role-icon"></div>${role}
                    </button>
                `).join('')}
            </div>
            <button class="remove-player-btn" data-player-name="${escapeHtml(player.name)}">&times;</button>
        `;
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

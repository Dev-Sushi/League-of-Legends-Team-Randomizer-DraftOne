// --- GLOBAL STATE ---
let playerPool = [];
const ALL_ROLES = ['TOP', 'JGL', 'MID', 'ADC', 'SUP'];
let randomizerMode = '5man';

// --- ROLE PREFERENCES PERSISTENCE ---
function saveRolePreferences() {
    const rolePreferences = {};
    playerPool.forEach(player => {
        if (player.roles && player.roles.length > 0) {
            rolePreferences[player.name] = player.roles;
        }
    });
    localStorage.setItem('lolTeamRandomizerRolePreferences', JSON.stringify(rolePreferences));
}

function loadRolePreferences() {
    const saved = localStorage.getItem('lolTeamRandomizerRolePreferences');
    return saved ? JSON.parse(saved) : {};
}

function applyRolePreferences() {
    const savedPreferences = loadRolePreferences();
    playerPool.forEach(player => {
        if (savedPreferences[player.name]) {
            player.roles = savedPreferences[player.name];
        }
    });
}

// --- DOM ELEMENTS (will be initialized after DOM loads) ---
let instructionsText;
let stageOneDiv;
let stageTwoDiv;
let stageThreeDiv;
let teamsContainer;
let chatInput;
let playerConfigContainer;

// --- STAGE NAVIGATION & CONTENT ---
function showStage(stage) {
    const stages = [stageOneDiv, stageTwoDiv, stageThreeDiv];
    const stageInstructions = {
        1: "Paste your lobby chat below to get the list of players.",
        2: "Select the roles each player can play, then randomize the teams.",
        3: "The teams are set! Reroll or edit the player list below."
    };

    instructionsText.innerHTML = stageInstructions[stage] || "";

    stages.forEach((div, index) => {
        if (index + 1 === stage) {
            div.classList.remove('hidden');
        } else {
            div.classList.add('hidden');
        }
    });
}

// --- UI RENDERING ---
function renderConfigUI() {
    playerConfigContainer.innerHTML = '';
    playerPool.forEach(player => {
        const row = document.createElement('div');
        row.className = 'player-config-row';
        row.innerHTML = `
            <span class="player-name">${player.name}</span>
            <div class="role-selector" data-player-name="${player.name}">
                ${ALL_ROLES.map(role => `<button class="role-button ${player.roles.includes(role) ? 'selected' : ''}" data-role="${role}"><div class="role-icon"></div>${role}</button>`).join('')}
            </div>
            <button class="remove-player-btn" data-player-name="${player.name}">&times;</button>
        `;
        playerConfigContainer.appendChild(row);
    });
}

function runRandomization() {
    let players = [...playerPool];

    // First check if we have enough players
    if (players.length < 1) {
        alert("You need at least one player to form a team!");
        return false;
    }

    // Shuffle players
    for (let i = players.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [players[i], players[j]] = [players[j], players[i]];
    }

    if (randomizerMode === '5man') {
        // For 5man mode, take up to 5 players
        const team = players.slice(0, 5);
        displayTeams(team, null);
        return true;
    } else {
        // For 5v5 mode, need at least 2 players
        if (players.length < 2) {
            alert("You need at least two players to form teams!");
            return false;
        }
        const midPoint = Math.ceil(players.length / 2);
        const team1 = players.slice(0, midPoint);
        const team2 = players.slice(midPoint);
        displayTeams(team1, team2);
        return true;
    }
}

function handleRandomization() {
    if (runRandomization()) {
        showStage(3);
    }
}

function displayTeams(team1, team2) {
    teamsContainer.innerHTML = '';

    if (randomizerMode === '5man') {
        teamsContainer.appendChild(createTeamElement('Team', 'team-1', team1));
    } else {
        teamsContainer.appendChild(createTeamElement('Team 1', 'team-1', team1));
        teamsContainer.appendChild(createTeamElement('Team 2', 'team-2', team2));
    }
}

function createTeamElement(title, id, players) {
    const teamDiv = document.createElement('div');
    teamDiv.className = 'team';
    teamDiv.id = id;
    teamDiv.innerHTML = `<h2>${title}</h2>`;
    const playerList = document.createElement('ul');

    let roleAssignments = solveRoleAssignment(players);

    if (roleAssignments) {
        const playersByRole = new Map();
        for (const [playerName, role] of roleAssignments.entries()) {
            playersByRole.set(role, playerName);
        }

        const assignedPlayers = new Set(roleAssignments.keys());
        const unassignedPlayers = players.filter(p => !assignedPlayers.has(p.name));

        ALL_ROLES.forEach(role => {
            const playerName = playersByRole.get(role);
            if (playerName) {
                const li = document.createElement('li');
                li.appendChild(document.createTextNode(playerName));

                const roleIconContainer = document.createElement('div');
                roleIconContainer.className = 'player-role-icon';
                roleIconContainer.innerHTML = `<div class="role-button" data-role="${role}"><div class="role-icon"></div></div>`;
                li.appendChild(roleIconContainer);

                playerList.appendChild(li);
            }
        });

        unassignedPlayers.forEach(player => {
            const li = document.createElement('li');
            li.textContent = `${player.name} (Unassigned)`;
            playerList.appendChild(li);
        });
    } else {
        players.forEach(player => {
            const li = document.createElement('li');
            li.appendChild(document.createTextNode(player.name));

            if (player.roles && player.roles.length > 0) {
                const roleSpan = document.createElement('span');
                roleSpan.className = 'player-role';
                roleSpan.textContent = player.roles.join(', ');
                li.appendChild(roleSpan);
            }

            playerList.appendChild(li);
        });
    }

    teamDiv.appendChild(playerList);
    return teamDiv;
}

function solveRoleAssignment(players) {
    const assignments = new Map();

    function canSolve(playerIndex) {
        if (playerIndex === players.length) return true;
        const player = players[playerIndex];
        const preferredRoles = [...player.roles].sort(() => Math.random() - 0.5);

        for (const role of preferredRoles) {
            if (!Array.from(assignments.values()).includes(role)) {
                assignments.set(player.name, role);
                if (canSolve(playerIndex + 1)) return true;
                assignments.delete(player.name);
            }
        }
        return false;
    }

    return canSolve(0) ? assignments : null;
}

// --- INITIALIZATION ---
function initializeApp() {
    // Initialize DOM elements
    instructionsText = document.getElementById('instructions-text');
    stageOneDiv = document.getElementById('stage-one-parse');
    stageTwoDiv = document.getElementById('stage-two-configure');
    stageThreeDiv = document.getElementById('stage-three-display');
    teamsContainer = document.getElementById('teams-container');
    chatInput = document.getElementById('chat-input');
    playerConfigContainer = document.getElementById('player-config-container');

    // Load saved lobby chat
    const savedLobby = localStorage.getItem('lolTeamRandomizerLobby');
    if (savedLobby) {
        chatInput.value = savedLobby;
    }
    showStage(1);

    // --- EVENT LISTENERS ---
    document.getElementById('parse-btn').addEventListener('click', () => {
        const inputText = chatInput.value;
        localStorage.setItem('lolTeamRandomizerLobby', inputText);
        const playerNames = new Set();
        const joinRegex = /(.+?#.+?)\s+joined the lobby/i;

        inputText.split('\n').forEach(line => {
            const match = line.trim().match(joinRegex);
            if (match) playerNames.add(match[1].trim());
        });

        if (playerNames.size < 2) {
            alert("Could not find at least two players in the lobby text.");
            return;
        }
        playerPool = Array.from(playerNames).map(name => ({ name, roles: [] }));
        applyRolePreferences(); // Apply saved role preferences for these players
        renderConfigUI();
        showStage(2);
    });

    playerConfigContainer.addEventListener('click', (e) => {
        const roleButton = e.target.closest('.role-button');
        if (roleButton) {
            const playerName = roleButton.parentElement.dataset.playerName;
            const role = roleButton.dataset.role;
            const player = playerPool.find(p => p.name === playerName);

            roleButton.classList.toggle('selected');
            if (player) {
                player.roles = player.roles.includes(role) ? player.roles.filter(r => r !== role) : [...player.roles, role];
                saveRolePreferences(); // Save after role change
            }
            return;
        }

        const removeButton = e.target.closest('.remove-player-btn');
        if (removeButton) {
            const playerName = removeButton.dataset.playerName;
            playerPool = playerPool.filter(p => p.name !== playerName);
            saveRolePreferences(); // Save after player removal
            renderConfigUI();
        }
    });

    document.getElementById('back-btn').addEventListener('click', () => {
        showStage(1);
    });

    document.getElementById('randomize-btn').addEventListener('click', handleRandomization);

    document.getElementById('edit-players-btn').addEventListener('click', () => {
        showStage(2);
    });

    document.getElementById('reroll-btn').addEventListener('click', handleRandomization);

    // Mode switch initialization
    const modeSwitch = document.getElementById('mode-switch-checkbox');
    const label5v5 = document.getElementById('mode-label-5v5');
    const label5man = document.getElementById('mode-label-5man');

    // Set initial switch state
    modeSwitch.checked = randomizerMode === '5v5';

    // Set initial label states
    if (randomizerMode === '5v5') {
        label5v5.classList.add('active');
        label5man.classList.remove('active');
    } else {
        label5man.classList.add('active');
        label5v5.classList.remove('active');
    }

    modeSwitch.addEventListener('change', e => {
        if (e.target.checked) {
            randomizerMode = '5v5';
            label5v5.classList.add('active');
            label5man.classList.remove('active');
        } else {
            randomizerMode = '5man';
            label5man.classList.add('active');
            label5v5.classList.remove('active');
        }
    });
}

// --- START APP ON DOM READY ---
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeApp);
} else {
    initializeApp();
}

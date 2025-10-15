// --- TEAM DISPLAY LOGIC ---
import { getRandomizerMode, getAllRoles } from './state.js';
import { solveRoleAssignment } from './randomizer.js';

/**
 * Shows shuffle animation overlay
 * @returns {HTMLElement} - The overlay element
 */
function showShuffleOverlay() {
    const overlay = document.createElement('div');
    overlay.className = 'shuffle-overlay';
    overlay.innerHTML = `
        <div class="shuffle-text">Randomizing...</div>
        <div class="shuffle-icon">🎲</div>
    `;
    document.body.appendChild(overlay);
    return overlay;
}

/**
 * Hides shuffle animation overlay
 * @param {HTMLElement} overlay - The overlay element to remove
 */
function hideShuffleOverlay(overlay) {
    overlay.classList.add('fade-out');
    setTimeout(() => {
        overlay.remove();
    }, 300);
}

/**
 * Displays the generated teams with animation
 * @param {Array} team1 - First team (or the only team in 5man mode)
 * @param {Array|null} team2 - Second team (null in 5man mode)
 */
export function displayTeams(team1, team2) {
    const teamsContainer = document.getElementById('teams-container');
    const mode = getRandomizerMode();

    // Show shuffle overlay
    const overlay = showShuffleOverlay();

    // Simulate shuffle duration (800ms)
    setTimeout(() => {
        // Clear container to retrigger animations
        teamsContainer.innerHTML = '';

        // Use DocumentFragment for better performance
        const fragment = document.createDocumentFragment();

        if (mode === '5man') {
            fragment.appendChild(createTeamElement('Team', 'team-1', team1));
        } else {
            fragment.appendChild(createTeamElement('Team 1', 'team-1', team1));
            fragment.appendChild(createTeamElement('Team 2', 'team-2', team2));
        }

        teamsContainer.appendChild(fragment);

        // Hide overlay after teams are rendered
        hideShuffleOverlay(overlay);
    }, 800);
}

/**
 * Creates a team element with role assignments
 * @param {string} title - Team title
 * @param {string} id - Team element ID
 * @param {Array} players - Array of player objects
 * @returns {HTMLElement} - Team div element
 */
function createTeamElement(title, id, players) {
    const teamDiv = document.createElement('div');
    teamDiv.className = 'team';
    teamDiv.id = id;
    teamDiv.innerHTML = `<h2>${title}</h2>`;

    const playerList = document.createElement('ul');
    const roleAssignments = solveRoleAssignment(players);

    if (roleAssignments) {
        renderPlayersWithRoles(playerList, players, roleAssignments);
    } else {
        renderPlayersWithoutRoles(playerList, players);
    }

    teamDiv.appendChild(playerList);
    return teamDiv;
}

/**
 * Renders players with assigned roles
 * @param {HTMLElement} playerList - UL element to append players to
 * @param {Array} players - Array of player objects
 * @param {Map} roleAssignments - Map of playerName -> role
 */
function renderPlayersWithRoles(playerList, players, roleAssignments) {
    const ALL_ROLES = getAllRoles();
    const playersByRole = new Map();

    for (const [playerName, role] of roleAssignments.entries()) {
        playersByRole.set(role, playerName);
    }

    const assignedPlayers = new Set(roleAssignments.keys());
    const unassignedPlayers = players.filter(p => !assignedPlayers.has(p.name));

    // Display players in role order
    ALL_ROLES.forEach(role => {
        const playerName = playersByRole.get(role);
        if (playerName) {
            const li = document.createElement('li');
            li.appendChild(document.createTextNode(playerName));

            const roleIconContainer = document.createElement('div');
            roleIconContainer.className = 'player-role-icon';
            roleIconContainer.innerHTML = `
                <div class="role-button" data-role="${role}">
                    <div class="role-icon"></div>
                </div>
            `;
            li.appendChild(roleIconContainer);
            playerList.appendChild(li);
        }
    });

    // Display unassigned players
    unassignedPlayers.forEach(player => {
        const li = document.createElement('li');
        li.textContent = `${player.name} (Unassigned)`;
        playerList.appendChild(li);
    });
}

/**
 * Renders players without role assignments (fallback)
 * @param {HTMLElement} playerList - UL element to append players to
 * @param {Array} players - Array of player objects
 */
function renderPlayersWithoutRoles(playerList, players) {
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

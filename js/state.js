// --- GLOBAL STATE MANAGEMENT ---
export const state = {
    playerPool: [],
    ALL_ROLES: ['TOP', 'JGL', 'MID', 'ADC', 'SUP'],
    randomizerMode: '5man'
};

export function setPlayerPool(players) {
    state.playerPool = players;
    saveRolePreferences();
}

export function getPlayerPool() {
    return state.playerPool;
}

export function setRandomizerMode(mode) {
    state.randomizerMode = mode;
}

export function getRandomizerMode() {
    return state.randomizerMode;
}

export function getAllRoles() {
    return state.ALL_ROLES;
}

export function updatePlayerRoles(playerName, role) {
    const player = state.playerPool.find(p => p.name === playerName);
    if (player) {
        if (player.roles.includes(role)) {
            player.roles = player.roles.filter(r => r !== role);
        } else {
            player.roles = [...player.roles, role];
        }
        saveRolePreferences();
    }
}

export function removePlayer(playerName) {
    state.playerPool = state.playerPool.filter(p => p.name !== playerName);
    saveRolePreferences();
}

/**
 * Saves player role preferences to localStorage
 */
function saveRolePreferences() {
    const rolePreferences = {};
    state.playerPool.forEach(player => {
        if (player.roles && player.roles.length > 0) {
            rolePreferences[player.name] = player.roles;
        }
    });
    localStorage.setItem('lolTeamRandomizerRolePreferences', JSON.stringify(rolePreferences));
}

/**
 * Loads saved role preferences from localStorage
 * @returns {Object} - Object mapping player names to their role arrays
 */
export function loadRolePreferences() {
    const saved = localStorage.getItem('lolTeamRandomizerRolePreferences');
    return saved ? JSON.parse(saved) : {};
}

/**
 * Applies saved role preferences to the current player pool
 */
export function applyRolePreferences() {
    const savedPreferences = loadRolePreferences();
    state.playerPool.forEach(player => {
        if (savedPreferences[player.name]) {
            player.roles = savedPreferences[player.name];
        }
    });
}

// --- RANDOMIZATION LOGIC ---

/**
 * Fisher-Yates shuffle algorithm
 * @param {Array} array - Array to shuffle
 * @returns {Array} - Shuffled array
 */
export function shuffleArray(array) {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
}

/**
 * Backtracking algorithm for role assignment
 * Assigns unique roles to players based on their preferences
 * @param {Array} players - Array of player objects with roles
 * @returns {Map|null} - Map of playerName -> role, or null if no solution
 */
export function solveRoleAssignment(players) {
    const assignments = new Map();
    const usedRoles = new Set();

    function canSolve(playerIndex) {
        if (playerIndex === players.length) return true;

        const player = players[playerIndex];
        // Randomize role order for variety
        const preferredRoles = [...player.roles].sort(() => Math.random() - 0.5);

        for (const role of preferredRoles) {
            // Check if role is already assigned (optimized with Set)
            if (!usedRoles.has(role)) {
                assignments.set(player.name, role);
                usedRoles.add(role);
                if (canSolve(playerIndex + 1)) return true;
                assignments.delete(player.name);
                usedRoles.delete(role); // Backtrack
            }
        }
        return false;
    }

    return canSolve(0) ? assignments : null;
}

/**
 * Validates if there are enough players for the selected mode
 * @param {number} playerCount - Number of players
 * @param {string} mode - '5man' or '5v5'
 * @returns {boolean} - Whether the player count is valid
 */
export function validatePlayerCount(playerCount, mode) {
    if (playerCount < 1) {
        return { valid: false, message: "You need at least one player to form a team!" };
    }

    if (mode === '5v5' && playerCount < 2) {
        return { valid: false, message: "You need at least two players to form teams!" };
    }

    return { valid: true };
}

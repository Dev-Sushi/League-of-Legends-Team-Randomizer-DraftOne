// --- LOBBY CHAT PARSER ---
export function parseLobbyChat(inputText) {
    const playerNames = new Set();
    const joinRegex = /(.+?#.+?)\s+joined the lobby/i;

    inputText.split('\n').forEach(line => {
        const match = line.trim().match(joinRegex);
        if (match) {
            playerNames.add(match[1].trim());
        }
    });

    return Array.from(playerNames).map(name => ({ name, roles: [] }));
}

export function saveLobbyToStorage(lobbyText) {
    localStorage.setItem('lolTeamRandomizerLobby', lobbyText);
}

export function loadLobbyFromStorage() {
    return localStorage.getItem('lolTeamRandomizerLobby') || '';
}

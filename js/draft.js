// --- DRAFT UI MODULE ---
import { socket, fetchChampionList, roomId, playerName, sendSocketMessage } from './app.js';

// --- STATE ---
let champions = []; // Array of {id, name, image}
let filteredChampions = [];
let gameState = {
    phase: 'idle',
    currentTeam: 'blue',
    currentAction: 'ban',
    blueBans: [],
    redBans: [],
    bluePicks: [],
    redPicks: []
};

/**
 * Finds a champion by name
 */
function findChampion(name) {
    return champions.find(c => c.name === name || c.id === name);
}

/**
 * Initializes the champion search functionality
 */
function initializeChampionSearch() {
    const searchInput = document.getElementById('champion-search');
    searchInput.addEventListener('input', (e) => {
        const searchTerm = e.target.value.toLowerCase().trim();
        if (searchTerm === '') {
            filteredChampions = [...champions];
        } else {
            filteredChampions = champions.filter(champ =>
                champ.name.toLowerCase().includes(searchTerm)
            );
        }
        renderChampionGrid(filteredChampions);
    });
}

/**
 * Renders the champion grid with images
 * @param {Array} championList - Array of champion objects
 */
export function renderChampionGrid(championList) {
    const grid = document.getElementById('champion-grid');
    grid.innerHTML = '';

    championList.forEach(champ => {
        const championCard = document.createElement('div');
        championCard.className = 'champion-card-league';
        championCard.dataset.champion = champ.name;

        const img = document.createElement('img');
        img.src = champ.image;
        img.alt = champ.name;
        img.className = 'champion-portrait';
        // Note: crossOrigin removed - Data Dragon CDN doesn't require CORS for images

        // Add error handling for image loading
        img.onerror = () => {
            console.error(`Failed to load image for ${champ.name}: ${champ.image}`);
            // Fallback: show champion name with styled background
            img.style.display = 'none';
            championCard.style.backgroundColor = 'rgba(26, 39, 58, 0.8)';
            championCard.style.display = 'flex';
            championCard.style.alignItems = 'center';
            championCard.style.justifyContent = 'center';
        };

        const nameLabel = document.createElement('div');
        nameLabel.className = 'champion-name-label';
        nameLabel.textContent = champ.name;

        championCard.appendChild(img);
        championCard.appendChild(nameLabel);
        championCard.addEventListener('click', () => handleChampionClick(champ.name));
        grid.appendChild(championCard);
    });

    // Update disabled state
    updateChampionGridAvailability();
}

/**
 * Handles champion card click event
 * @param {string} championName - Name of the clicked champion
 */
function handleChampionClick(championName) {
    // Send action to server via WebSocket with the correct format
    const message = {
        type: gameState.currentAction, // Use 'type' to match server expectation
        champion: championName,
        playerName: playerName
    };

    sendSocketMessage(message);
    console.log('Sent to server:', message);
}

/**
 * Updates the draft UI based on the current game state
 * @param {Object} newGameState - The updated game state from server
 */
export function updateDraftUI(newGameState) {
    if (newGameState) {
        gameState = { ...gameState, ...newGameState };
    }

    // Update draft status
    const statusElement = document.getElementById('draft-status');
    const phaseElement = document.getElementById('draft-phase-indicator');

    if (gameState.phase === 'complete') {
        statusElement.textContent = 'Draft Complete!';
        phaseElement.textContent = 'COMPLETE';
    } else if (gameState.phase === 'drafting') {
        // Build status text based on current team and action
        const teamText = gameState.currentTeam === 'blue' ? 'Blue Team' : 'Red Team';
        const actionText = gameState.currentAction === 'ban' ? 'Banning' : 'Picking';
        statusElement.textContent = `${teamText} ${actionText}...`;

        // Determine phase based on ban/pick counts
        const totalBans = (gameState.blueBans || []).length + (gameState.redBans || []).length;
        const totalPicks = (gameState.bluePicks || []).length + (gameState.redPicks || []).length;

        if (totalBans < 6) {
            phaseElement.textContent = 'BAN PHASE 1';
        } else if (totalPicks < 6) {
            phaseElement.textContent = 'PICK PHASE 1';
        } else if (totalBans < 10) {
            phaseElement.textContent = 'BAN PHASE 2';
        } else {
            phaseElement.textContent = 'PICK PHASE 2';
        }
    } else {
        // Idle or waiting state
        statusElement.textContent = 'Waiting for draft to begin...';
        phaseElement.textContent = 'IDLE';
    }

    // Update Bravery Mode toggle
    const braveryToggle = document.getElementById('bravery-mode-checkbox');
    const braveryContainer = document.getElementById('bravery-mode-toggle-container');
    const braveryResetBtn = document.getElementById('reset-bravery-session-btn');

    if (braveryToggle && newGameState && typeof newGameState.isBraveryMode !== 'undefined') {
        braveryToggle.checked = newGameState.isBraveryMode;
    }

    // Only show bravery mode controls to host
    if (braveryContainer && braveryToggle && braveryResetBtn) {
        const isHost = gameState.hostName === playerName;

        if (isHost) {
            // Enable controls for host
            braveryToggle.disabled = false;
            braveryResetBtn.disabled = false;
            braveryContainer.style.opacity = '1';
            braveryContainer.title = '';
        } else {
            // Disable controls for non-hosts
            braveryToggle.disabled = true;
            braveryResetBtn.disabled = true;
            braveryContainer.style.opacity = '0.5';
            braveryContainer.title = 'Only the host can toggle Bravery Mode';
        }
    }

    // Update player lists
    updatePlayerList('blue', gameState.bluePlayers || []);
    updatePlayerList('red', gameState.redPlayers || []);

    // Update bans (5 slots per team, horizontal)
    updateBanDisplay('blue', gameState.blueBans);
    updateBanDisplay('red', gameState.redBans);

    // Update picks (5 slots per team, vertical)
    updatePickDisplay('blue', gameState.bluePicks);
    updatePickDisplay('red', gameState.redPicks);

    // Update champion grid (disable picked/banned champions)
    updateChampionGridAvailability();
}

/**
 * Updates the player list for a team
 * @param {string} team - 'blue' or 'red'
 * @param {string[]} players - Array of player names
 */
function updatePlayerList(team, players) {
    const playerContainer = document.getElementById(`${team}-team-players`);
    if (!playerContainer) {
        console.warn(`Player container for ${team} team not found`);
        return;
    }

    const captain = team === 'blue' ? gameState.blueCaptain : gameState.redCaptain;
    playerContainer.innerHTML = '<h3>Players</h3>';
    const ul = document.createElement('ul');

    // Ensure players is an array
    const playerArray = Array.isArray(players) ? players : [];

    if (playerArray.length === 0) {
        const li = document.createElement('li');
        li.textContent = 'No players yet';
        li.style.fontStyle = 'italic';
        li.style.opacity = '0.6';
        ul.appendChild(li);
    } else {
        playerArray.forEach(player => {
            const li = document.createElement('li');
            li.textContent = player;
            if (player === captain) {
                li.textContent += ' (C)';
            }
            ul.appendChild(li);
        });
    }

    playerContainer.appendChild(ul);
    console.log(`Updated ${team} team players:`, playerArray);
}

/**
 * Updates the ban display for a team (horizontal with images)
 * @param {string} team - 'blue' or 'red'
 * @param {string[]} bans - Array of banned champion names
 */
function updateBanDisplay(team, bans) {
    const banContainer = document.getElementById(`${team}-team-bans`);
    banContainer.innerHTML = '';

    const maxBans = 5;
    for (let i = 0; i < maxBans; i++) {
        const banSlot = document.createElement('div');
        banSlot.className = 'ban-slot-league';

        if (i < bans.length) {
            const champ = findChampion(bans[i]);
            if (champ) {
                banSlot.classList.add('filled');

                const img = document.createElement('img');
                img.src = champ.image;
                img.alt = champ.name;
                img.className = 'ban-portrait';

                img.onerror = () => {
                    console.error(`Failed to load ban image for ${champ.name}: ${champ.image}`);
                    img.style.display = 'none';
                };

                const banX = document.createElement('div');
                banX.className = 'ban-x';
                banX.textContent = '✕';

                banSlot.appendChild(img);
                banSlot.appendChild(banX);
            }
        } else {
            banSlot.classList.add('empty');
        }

        banContainer.appendChild(banSlot);
    }
}

/**
 * Updates the pick display for a team (vertical with large images)
 * @param {string} team - 'blue' or 'red'
 * @param {string[]} picks - Array of picked champion names
 */
function updatePickDisplay(team, picks) {
    const pickContainer = document.getElementById(`${team}-team-picks`);
    pickContainer.innerHTML = '';

    const maxPicks = 5;
    for (let i = 0; i < maxPicks; i++) {
        const pickSlot = document.createElement('div');
        pickSlot.className = 'pick-slot-league';

        if (i < picks.length) {
            const champ = findChampion(picks[i]);
            if (champ) {
                pickSlot.classList.add('filled');

                const portraitContainer = document.createElement('div');
                portraitContainer.className = 'pick-portrait-container';

                const img = document.createElement('img');
                img.src = champ.image;
                img.alt = champ.name;
                img.className = 'pick-portrait';

                img.onerror = () => {
                    console.error(`Failed to load pick image for ${champ.name}: ${champ.image}`);
                    img.style.display = 'none';
                    portraitContainer.style.backgroundColor = 'rgba(26, 39, 58, 0.8)';
                };

                portraitContainer.appendChild(img);

                const champName = document.createElement('div');
                champName.className = 'pick-champ-name';
                champName.textContent = champ.name;

                const position = document.createElement('div');
                position.className = 'pick-position';
                position.textContent = `Pick ${i + 1}`;

                pickSlot.appendChild(portraitContainer);
                pickSlot.appendChild(champName);
                pickSlot.appendChild(position);
            }
        } else {
            pickSlot.classList.add('empty');

            const emptyContainer = document.createElement('div');
            emptyContainer.className = 'pick-portrait-container empty-portrait';

            const position = document.createElement('div');
            position.className = 'pick-position';
            position.textContent = `Pick ${i + 1}`;

            pickSlot.appendChild(emptyContainer);
            pickSlot.appendChild(position);
        }

        pickContainer.appendChild(pickSlot);
    }
}

/**
 * Updates champion grid to show availability
 */
function updateChampionGridAvailability() {
    const allBans = [...gameState.blueBans, ...gameState.redBans];
    const allPicks = [...gameState.bluePicks, ...gameState.redPicks];
    const braveryUsed = gameState.braveryModeUsedChampions || [];
    const unavailable = new Set([...allBans, ...allPicks, ...braveryUsed]);

    const championCards = document.querySelectorAll('.champion-card-league');
    const isMyTurnToBan = (gameState.currentAction === 'ban' &&
                           ((gameState.currentTeam === 'blue' && playerName === gameState.blueCaptain) ||
                            (gameState.currentTeam === 'red' && playerName === gameState.redCaptain)));

    const isMyTurnToPick = (gameState.currentAction === 'pick' &&
                           ((gameState.currentTeam === 'blue' && playerName === gameState.blueCaptain) ||
                            (gameState.currentTeam === 'red' && playerName === gameState.redCaptain)));

    championCards.forEach(card => {
        const championName = card.dataset.champion;
        if (unavailable.has(championName) ||
            (gameState.currentAction === 'ban' && !isMyTurnToBan) ||
            (gameState.currentAction === 'pick' && !isMyTurnToPick)) {
            card.classList.add('disabled');
        } else {
            card.classList.remove('disabled');
        }
    });
}

/**
 * Initializes the draft UI
 */
export async function initializeDraft() {
    console.log('Initializing tournament draft... roomId:', roomId);

    // Fetch initial draft state
    try {
        if (!roomId) {
            console.warn('roomId is null, skipping initial state fetch');
        } else {
            const response = await fetch(`/api/draft/${roomId}`);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const initialState = await response.json();
            updateDraftUI(initialState);
        }
    } catch (error) {
        console.error('Could not fetch initial draft state:', error);
    }

    // Fetch champions if not already loaded
    if (champions.length === 0) {
        const rawChampions = await fetchChampionList();
        // Ensure data is in the correct {id, name, image} format
        champions = rawChampions.map(champ => ({
            id: champ.id,
            name: champ.name,
            image: champ.image
        }));
        filteredChampions = [...champions];
    }

    // Render the champion grid
    renderChampionGrid(filteredChampions);

    // Initialize search
    initializeChampionSearch();

    // Initialize UI
    updateDraftUI();
}

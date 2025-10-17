// --- DRAFT UI MODULE ---

import { preloadSounds, playBanSound, playPickSound, playChampionHoverSound, playPhaseSound } from './sounds.js';
import * as Multiplayer from './multiplayer.js';

// --- STATE ---
let champions = []; // Array of {id, name, image, tags}
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
let fearlessDraftEnabled = false;
let fearlessUsedChampions = new Set(JSON.parse(localStorage.getItem('fearlessUsedChampions')) || []);
let selectedRole = 'All';
let draftMode = 'solo'; // 'solo' or 'multiplayer'
let myTeam = null; // 'blue' or 'red' in multiplayer mode

// --- CHAMPION API ---
/**
 * Fetches the list of champions from the Data Dragon API
 * @returns {Promise<Array>} - Array of champion objects or empty array
 */
async function fetchChampionList() {
    try {
        const versionsResponse = await fetch('https://ddragon.leagueoflegends.com/api/versions.json');
        if (!versionsResponse.ok) {
            throw new Error(`Failed to fetch versions: ${versionsResponse.status}`);
        }
        const versions = await versionsResponse.json();
        const latestVersion = versions[0];

        const response = await fetch(`https://ddragon.leagueoflegends.com/cdn/${latestVersion}/data/en_US/champion.json`);
        if (!response.ok) {
            throw new Error(`Failed to fetch champions: ${response.status}`);
        }
        const championsData = await response.json();
        const baseUrl = `https://ddragon.leagueoflegends.com/cdn/${latestVersion}/img/champion/`;
        const championArray = Object.values(championsData.data).map(champ => ({
            id: champ.id,
            name: champ.name,
            image: baseUrl + champ.image.full,
            tags: champ.tags
        }));
        console.log('Champions loaded:', championArray.length, 'champions');
        return championArray;
    } catch (error) {
        console.error('Error fetching champions:', error);
        return [];
    }
}

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
        selectedRole = 'All';
        filterChampions();
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

        img.onerror = () => {
            console.error(`Failed to load image for ${champ.name}: ${champ.image}`);
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

        // Add hover sound effect
        championCard.addEventListener('mouseenter', () => {
            if (gameState.phase === 'drafting' && !championCard.classList.contains('disabled')) {
                playChampionHoverSound();
            }
        });

        championCard.addEventListener('click', () => handleChampionClick(champ.name));
        grid.appendChild(championCard);
    });

    updateChampionGridAvailability();
}

/**
 * Handles champion card click event
 * @param {string} championName - Name of the clicked champion
 */
function handleChampionClick(championName) {
    if (gameState.phase !== 'drafting') return;

    // In multiplayer mode, check if it's the player's turn
    if (draftMode === 'multiplayer') {
        // Spectators can't make actions
        if (myTeam === 'spectator') {
            alert("Spectators cannot make draft actions!");
            return;
        }

        if (gameState.currentTeam !== myTeam) {
            alert("It's not your turn!");
            return;
        }
        // Send action to server
        Multiplayer.sendDraftAction(championName);
        // Server will handle validation and broadcast the update
        return;
    }

    // Solo mode logic (existing)
    const isUnavailable = [...gameState.blueBans, ...gameState.redBans, ...gameState.bluePicks, ...gameState.redPicks].includes(championName);
    if (isUnavailable) {
        alert('Champion is already picked or banned.');
        return;
    }

    if (fearlessDraftEnabled && fearlessUsedChampions.has(championName)) {
        alert('Champion has been picked in a previous draft in this session.');
        return;
    }

    const championCard = document.querySelector(`[data-champion="${championName}"]`);

    if (gameState.currentAction === 'ban') {
        if (gameState.currentTeam === 'blue') {
            gameState.blueBans.push(championName);
        } else {
            gameState.redBans.push(championName);
        }
        championCard.classList.add('banned');

        // Play ban sound effect
        playBanSound(gameState.currentTeam);
    } else if (gameState.currentAction === 'pick') {
        if (gameState.currentTeam === 'blue') {
            gameState.bluePicks.push(championName);
        } else {
            gameState.redPicks.push(championName);
        }
        if (fearlessDraftEnabled) {
            fearlessUsedChampions.add(championName);
            localStorage.setItem('fearlessUsedChampions', JSON.stringify(Array.from(fearlessUsedChampions)));
        }
        championCard.classList.add('picked');

        // Play pick sound effect
        playPickSound(gameState.currentTeam);
    }

    setTimeout(() => {
        advanceDraft();
        updateDraftUI();
    }, 500);
}

/**
 * Advances the draft to the next state
 */
function advanceDraft() {
    const draftOrder = [
        { action: 'ban', team: 'blue' }, { action: 'ban', team: 'red' },
        { action: 'ban', team: 'blue' }, { action: 'ban', team: 'red' },
        { action: 'ban', team: 'blue' }, { action: 'ban', team: 'red' },
        { action: 'pick', team: 'blue' }, { action: 'pick', team: 'red' },
        { action: 'pick', team: 'red' }, { action: 'pick', team: 'blue' },
        { action: 'pick', team: 'blue' }, { action: 'pick', team: 'red' },
        { action: 'ban', team: 'red' }, { action: 'ban', team: 'blue' },
        { action: 'ban', team: 'red' }, { action: 'ban', team: 'blue' },
        { action: 'pick', team: 'red' }, { action: 'pick', team: 'blue' },
        { action: 'pick', team: 'blue' }, { action: 'pick', team: 'red' },
    ];

    const totalActions = gameState.blueBans.length + gameState.redBans.length + gameState.bluePicks.length + gameState.redPicks.length;
    const previousTotalActions = totalActions - 1;

    if (totalActions < draftOrder.length) {
        const nextAction = draftOrder[totalActions];
        const previousAction = previousTotalActions >= 0 ? draftOrder[previousTotalActions] : null;

        gameState.currentAction = nextAction.action;
        gameState.currentTeam = nextAction.team;

        // Play phase sound when transitioning between major phases
        if (previousAction && previousAction.action !== nextAction.action) {
            playPhaseSound();
        }
    } else {
        gameState.phase = 'complete';
        gameState.currentAction = null;
        gameState.currentTeam = null;
        playPhaseSound();
    }
}

/**
 * Updates the draft UI based on the current game state
 */
export function updateDraftUI(newGameState = null) {
    // If new state provided (from multiplayer), merge it
    if (newGameState) {
        gameState = { ...gameState, ...newGameState };
    }

    const statusElement = document.getElementById('draft-status');
    const phaseElement = document.getElementById('draft-phase-indicator');
    const body = document.body;
    const championGrid = document.getElementById('champion-grid');

    body.classList.remove('blue-turn', 'red-turn', 'my-turn', 'opponent-turn', 'spectator-mode');
    championGrid.classList.remove('picking', 'banning');

    // Add animation classes for visual feedback
    statusElement.classList.remove('draft-status-text-update');
    phaseElement.classList.remove('draft-phase-update');

    // Trigger reflow to restart animation
    void statusElement.offsetWidth;
    void phaseElement.offsetWidth;

    statusElement.classList.add('draft-status-text-update');
    phaseElement.classList.add('draft-phase-update');

    if (gameState.phase === 'complete') {
        statusElement.textContent = 'Draft Complete!';
        phaseElement.textContent = 'COMPLETE';
    } else if (gameState.phase === 'drafting') {
        const teamText = gameState.currentTeam === 'blue' ? 'Blue Team' : 'Red Team';
        const actionText = gameState.currentAction === 'ban' ? 'Banning' : 'Picking';

        // Update status text for multiplayer
        if (draftMode === 'multiplayer') {
            if (myTeam === 'spectator') {
                statusElement.textContent = `Spectating - ${teamText} ${actionText}...`;
                body.classList.add('spectator-mode');
            } else {
                const isMyTurn = gameState.currentTeam === myTeam;
                statusElement.textContent = isMyTurn
                    ? `Your Turn - ${actionText}`
                    : `Opponent ${actionText}...`;
                body.classList.add(isMyTurn ? 'my-turn' : 'opponent-turn');
            }
        } else {
            statusElement.textContent = `${teamText} ${actionText}...`;
        }

        if (gameState.currentTeam === 'blue') {
            body.classList.add('blue-turn');
        } else {
            body.classList.add('red-turn');
        }

        if (gameState.currentAction === 'pick') {
            championGrid.classList.add('picking');
        } else {
            championGrid.classList.add('banning');
        }

        const totalActions = gameState.blueBans.length + gameState.redBans.length + gameState.bluePicks.length + gameState.redPicks.length;

        if (totalActions < 6) {
            phaseElement.textContent = 'BAN PHASE 1';
        } else if (totalActions < 12) {
            phaseElement.textContent = 'PICK PHASE 1';
        } else if (totalActions < 16) {
            phaseElement.textContent = 'BAN PHASE 2';
        } else {
            phaseElement.textContent = 'PICK PHASE 2';
        }
    } else {
        statusElement.textContent = 'Waiting for draft to begin...';
        phaseElement.textContent = 'IDLE';
    }

    updateBanDisplay('blue', gameState.blueBans);
    updateBanDisplay('red', gameState.redBans);
    updatePickDisplay('blue', gameState.bluePicks);
    updatePickDisplay('red', gameState.redPicks);
    updateChampionGridAvailability();
}

/**
 * Updates the ban display for a team
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
 * Updates the pick display for a team
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
    const unavailable = new Set([...allBans, ...allPicks]);

    if (fearlessDraftEnabled) {
        fearlessUsedChampions.forEach(champ => unavailable.add(champ));
    }

    const championCards = document.querySelectorAll('.champion-card-league');

    championCards.forEach(card => {
        const championName = card.dataset.champion;
        if (unavailable.has(championName)) {
            card.classList.add('disabled');
        } else {
            card.classList.remove('disabled');
        }
    });
}

/**
 * Initializes the draft UI
 * @param {string} mode - 'solo' or 'multiplayer'
 * @param {string} team - 'blue' or 'red' (only for multiplayer)
 */
export async function initializeDraft(mode = 'solo', team = null) {
    console.log(`Initializing ${mode} draft...`);

    draftMode = mode;
    myTeam = team;

    // Preload sound effects
    preloadSounds();

    gameState = {
        phase: 'idle',
        currentTeam: 'blue',
        currentAction: 'ban',
        blueBans: [],
        redBans: [],
        bluePicks: [],
        redPicks: []
    };

    if (champions.length === 0) {
        champions = await fetchChampionList();
        filteredChampions = [...champions];
    }

    renderChampionGrid(filteredChampions);
    initializeChampionSearch();
    initializeFearlessDraft();
    initializeRoleFilter();

    // Setup multiplayer callbacks if in multiplayer mode
    if (mode === 'multiplayer') {
        Multiplayer.onDraftUpdate((newState, playerTeam) => {
            myTeam = playerTeam;
            updateDraftUI(newState);

            // Play sound effects for opponent's actions
            if (newState.currentTeam !== playerTeam) {
                const lastAction = newState.currentAction;
                if (lastAction === 'ban' || lastAction === 'pick') {
                    const soundTeam = newState.currentTeam === 'blue' ? 'red' : 'blue';
                    if (lastAction === 'ban') {
                        playBanSound(soundTeam);
                    } else {
                        playPickSound(soundTeam);
                    }
                }
            }
        });
    } else {
        // Solo mode: start draft immediately
        gameState.phase = 'drafting';
        advanceDraft();
        updateDraftUI();
    }
}

function initializeFearlessDraft() {
    const fearlessToggle = document.getElementById('fearless-draft-checkbox');
    const fearlessResetBtn = document.getElementById('reset-fearless-session-btn');
    const fearlessLabel = document.getElementById('fearless-draft-label-text');

    fearlessToggle.checked = fearlessDraftEnabled;
    fearlessLabel.classList.toggle('active', fearlessDraftEnabled);
    fearlessResetBtn.classList.toggle('hidden', !fearlessDraftEnabled);

    // Disable toggle in multiplayer if not host
    if (draftMode === 'multiplayer') {
        const isHost = Multiplayer.getIsHost();
        if (!isHost) {
            fearlessToggle.disabled = true;
            fearlessResetBtn.disabled = true;
        }
    }

    fearlessToggle.addEventListener('change', (e) => {
        fearlessDraftEnabled = e.target.checked;
        fearlessLabel.classList.toggle('active', fearlessDraftEnabled);
        fearlessResetBtn.classList.toggle('hidden', !fearlessDraftEnabled);

        // In multiplayer, sync with server
        if (draftMode === 'multiplayer') {
            Multiplayer.toggleFearlessDraft(fearlessDraftEnabled);
        } else {
            updateChampionGridAvailability();
        }
    });

    fearlessResetBtn.addEventListener('click', () => {
        if (confirm('Are you sure you want to reset the Fearless Draft session? This will clear all used champions.')) {
            if (draftMode === 'multiplayer') {
                Multiplayer.resetFearlessSession();
            } else {
                fearlessUsedChampions.clear();
                localStorage.removeItem('fearlessUsedChampions');
                updateChampionGridAvailability();
            }
        }
    });
}

let roleFilterInitialized = false;

function initializeRoleFilter() {
    const roleFilterContainer = document.getElementById('role-filter-container');
    roleFilterContainer.innerHTML = '';
    const roles = ['All', 'Fighter', 'Tank', 'Mage', 'Assassin', 'Marksman', 'Support'];

    roles.forEach(role => {
        const button = document.createElement('button');
        button.className = 'role-filter-btn';
        button.textContent = role;
        if (role === selectedRole) {
            button.classList.add('selected');
        }
        button.addEventListener('click', () => {
            selectedRole = role;
            filterChampions();
            const buttons = roleFilterContainer.querySelectorAll('.role-filter-btn');
            buttons.forEach(btn => btn.classList.remove('selected'));
            button.classList.add('selected');
        });
        roleFilterContainer.appendChild(button);
    });
    roleFilterInitialized = true;
}

function filterChampions() {
    const searchTerm = document.getElementById('champion-search').value.toLowerCase().trim();
    let tempChampions = [...champions];

    if (searchTerm) {
        tempChampions = tempChampions.filter(champ =>
            champ.name.toLowerCase().includes(searchTerm)
        );
    }

    if (selectedRole !== 'All') {
        tempChampions = tempChampions.filter(champ => champ.tags.includes(selectedRole));
    }

    filteredChampions = tempChampions;
    renderChampionGrid(filteredChampions);
}
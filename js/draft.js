
// --- DRAFT UI MODULE ---

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
let fearlessDraftEnabled = false;
let fearlessUsedChampions = new Set(JSON.parse(localStorage.getItem('fearlessUsedChampions')) || []);

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
            image: baseUrl + champ.image.full
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

    const isUnavailable = [...gameState.blueBans, ...gameState.redBans, ...gameState.bluePicks, ...gameState.redPicks].includes(championName);
    if (isUnavailable) {
        alert('Champion is already picked or banned.');
        return;
    }

    if (fearlessDraftEnabled && fearlessUsedChampions.has(championName)) {
        alert('Champion has been picked in a previous draft in this session.');
        return;
    }

    if (gameState.currentAction === 'ban') {
        if (gameState.currentTeam === 'blue') {
            gameState.blueBans.push(championName);
        } else {
            gameState.redBans.push(championName);
        }
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
    }

    advanceDraft();
    updateDraftUI();
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

    if (totalActions < draftOrder.length) {
        const nextAction = draftOrder[totalActions];
        gameState.currentAction = nextAction.action;
        gameState.currentTeam = nextAction.team;
    } else {
        gameState.phase = 'complete';
        gameState.currentAction = null;
        gameState.currentTeam = null;
    }
}

/**
 * Updates the draft UI based on the current game state
 */
export function updateDraftUI() {
    const statusElement = document.getElementById('draft-status');
    const phaseElement = document.getElementById('draft-phase-indicator');

    if (gameState.phase === 'complete') {
        statusElement.textContent = 'Draft Complete!';
        phaseElement.textContent = 'COMPLETE';
    } else if (gameState.phase === 'drafting') {
        const teamText = gameState.currentTeam === 'blue' ? 'Blue Team' : 'Red Team';
        const actionText = gameState.currentAction === 'ban' ? 'Banning' : 'Picking';
        statusElement.textContent = `${teamText} ${actionText}...`;

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
 */
export async function initializeDraft() {
    console.log('Initializing single-user draft...');

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
    
    gameState.phase = 'drafting';
    advanceDraft();
    updateDraftUI();
}

function initializeFearlessDraft() {
    const fearlessToggle = document.getElementById('fearless-draft-checkbox');
    const fearlessResetBtn = document.getElementById('reset-fearless-session-btn');
    const fearlessLabel = document.getElementById('fearless-draft-label-text');

    fearlessToggle.checked = fearlessDraftEnabled;
    fearlessLabel.classList.toggle('active', fearlessDraftEnabled);
    fearlessResetBtn.classList.toggle('hidden', !fearlessDraftEnabled);


    fearlessToggle.addEventListener('change', (e) => {
        fearlessDraftEnabled = e.target.checked;
        fearlessLabel.classList.toggle('active', fearlessDraftEnabled);
        fearlessResetBtn.classList.toggle('hidden', !fearlessDraftEnabled);
        updateChampionGridAvailability();
    });

    fearlessResetBtn.addEventListener('click', () => {
        if (confirm('Are you sure you want to reset the Fearless Draft session? This will clear all used champions.')) {
            fearlessUsedChampions.clear();
            localStorage.removeItem('fearlessUsedChampions');
            updateChampionGridAvailability();
        }
    });
}

// --- SOUND EFFECTS MODULE ---

/**
 * Sound effect manager for champion select
 * Uses audio files from Community Dragon CDN
 */

const SOUND_BASE_URL = 'https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-champ-select/global/default/sounds/';

// Sound effect paths
const SOUNDS = {
    // Ban sounds
    banYourTeam: 'sfx-cs-draft-ban-your-team.ogg',
    banEnemyTeam: 'sfx-cs-draft-ban-enemy-team.ogg',
    banButtonClick: 'sfx-cs-draft-ban-button-click.ogg',
    banButtonHover: 'sfx-cs-draft-ban-button-hover.ogg',

    // Pick sounds
    pickIntro: 'sfx-cs-draft-pick-intro.ogg',
    pickLeft: 'sfx-cs-draft-left-pick-single.ogg',
    pickRight: 'sfx-cs-draft-right-pick-single.ogg',
    pickNotif: 'sfx-cs-draft-notif-yourpick.ogg',

    // Lock/UI sounds
    lockIn: 'sfx-cs-lockin-button-click.ogg',
    lockHover: 'sfx-cs-lockin-button-hover.ogg',
    gridHover: 'sfx-uikit-grid-hover.ogg',
    buttonHover: 'sfx-uikit-button-gold-hover.ogg',
};

// Preload audio elements
const audioCache = {};

/**
 * Preloads all sound effects
 */
export function preloadSounds() {
    Object.entries(SOUNDS).forEach(([key, filename]) => {
        const audio = new Audio(SOUND_BASE_URL + filename);
        audio.preload = 'auto';
        audio.volume = 0.5; // Default volume
        audioCache[key] = audio;
    });
    console.log('Sound effects preloaded');
}

/**
 * Plays a sound effect
 * @param {string} soundKey - Key from SOUNDS object
 * @param {number} volume - Volume level (0-1), defaults to 0.5
 */
export function playSound(soundKey, volume = 0.5) {
    const audio = audioCache[soundKey];
    if (!audio) {
        console.warn(`Sound not found: ${soundKey}`);
        return;
    }

    // Clone the audio to allow overlapping sounds
    const soundClone = audio.cloneNode();
    soundClone.volume = volume;

    soundClone.play().catch(error => {
        console.warn(`Failed to play sound ${soundKey}:`, error);
    });
}

/**
 * Sets the master volume for all sounds
 * @param {number} volume - Volume level (0-1)
 */
export function setMasterVolume(volume) {
    Object.values(audioCache).forEach(audio => {
        audio.volume = volume;
    });
}

/**
 * Plays the appropriate ban sound based on team
 * @param {string} team - 'blue' or 'red'
 */
export function playBanSound(team) {
    // Use different sound for your team vs enemy team
    const soundKey = team === 'blue' ? 'banYourTeam' : 'banEnemyTeam';
    playSound(soundKey, 0.6);
}

/**
 * Plays the appropriate pick sound based on team
 * @param {string} team - 'blue' or 'red'
 */
export function playPickSound(team) {
    // Use left pick for blue team, right pick for red team
    const soundKey = team === 'blue' ? 'pickLeft' : 'pickRight';
    playSound(soundKey, 0.6);
}

/**
 * Plays hover sound for champion cards
 */
export function playChampionHoverSound() {
    playSound('gridHover', 0.3);
}

/**
 * Plays button hover sound
 */
export function playButtonHoverSound() {
    playSound('buttonHover', 0.3);
}

/**
 * Plays lock-in sound
 */
export function playLockInSound() {
    playSound('lockIn', 0.5);
}

/**
 * Plays phase transition sound
 */
export function playPhaseSound() {
    playSound('pickNotif', 0.4);
}

# League of Legends Team Randomizer

A simple, client-side web application for creating randomized League of Legends teams with role assignments and a single-user draft mode.

## Features

- 🎲 **Team Randomization** - Intelligent team generation with Fisher-Yates shuffle
- 🎯 **Role Assignment** - Automatic role assignment based on player preferences
- 💾 **Persistence** - LocalStorage saves lobby chat and role preferences
- 🎨 **Animated UI** - Smooth shuffle animations and staggered player reveals
- 🔄 **Regenerate** - Instantly create new team arrangements
- 🎮 **Single-User Draft Mode** - Full tournament draft with bans and picks for a single user
- 📱 **Responsive** - Works on desktop and mobile
- 🌙 **League Theme** - Authentic League of Legends styling

## Quick Start

**⚠️ Important:** You cannot open `index.html` directly from the file system due to CORS restrictions with ES6 modules. You must use an HTTP server.

```bash
# Using Python (if installed)
python -m http.server 7778

# Using npx (no install needed)
npx http-server -p 7778
```

Open [http://localhost:7778](http://localhost:7778)

## Game Modes

- **Quick Play (5man)** - Create a single team of up to 5 players
- **Draft Pick (5v5)** - Split players into two balanced teams

## Technology Stack

- **Frontend**: Vanilla JavaScript (ES6 modules), HTML5, CSS3
- **APIs**: Riot Data Dragon for champion data
- **Storage**: LocalStorage for client-side persistence

## Development

### Prerequisites

- A modern web browser with ES6 module support.

### Making Changes

- **Frontend**: Edit files in `css/`, `js/`, or `index.html`
- **Styles**: Edit `css/styles.css`

No build step required! Just refresh the browser.

---

**Made with ⚔️ for the League of Legends community**

*Not affiliated with Riot Games*
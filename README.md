# League of Legends Team Randomizer

A modular web application for creating randomized League of Legends teams with role assignments and tournament draft functionality.

**Live at:** [https://draftone.dev-sushi.com](https://draftone.dev-sushi.com)

![League of Legends](https://img.shields.io/badge/League%20of%20Legends-Team%20Randomizer-gold)
![Docker](https://img.shields.io/badge/Docker-Ready-blue)
![License](https://img.shields.io/badge/License-ISC-green)

## Features

- 🎲 **Team Randomization** - Intelligent team generation with Fisher-Yates shuffle
- 🎯 **Role Assignment** - Automatic role assignment based on player preferences
- 💾 **Persistence** - LocalStorage saves lobby chat and role preferences
- 🎨 **Animated UI** - Smooth shuffle animations and staggered player reveals
- 🔄 **Regenerate** - Instantly create new team arrangements
- 🎮 **Draft Mode** - Full tournament draft with bans and picks (WebSocket-powered)
- 📱 **Responsive** - Works on desktop and mobile
- 🌙 **League Theme** - Authentic League of Legends styling

## Quick Start

### Option 1: Docker (Recommended)

```bash
docker-compose up -d
```

Open [http://localhost:8080](http://localhost:8080)

### Option 2: Node.js

```bash
npm install
npm start
```

Open [http://localhost:8080](http://localhost:8080)

### Option 3: Simple HTTP Server

**⚠️ Important:** You cannot open `index.html` directly from the file system due to CORS restrictions with ES6 modules. You must use an HTTP server.

```bash
# Using Python (if installed)
python -m http.server 8080

# Using npx (no install needed)
npx http-server -p 8080
```

Open [http://localhost:8080](http://localhost:8080)

**Note:** Draft mode requires the backend server (Option 1 or 2).

## Usage

1. **Paste Lobby Chat** - Copy lobby chat from League client
2. **Select Roles** - Each player picks their preferred roles
3. **Randomize** - Generate balanced teams with role assignments
4. **Reroll** - Click to create new teams instantly

## Game Modes

- **Quick Play (5man)** - Create a single team of up to 5 players
- **Draft Pick (5v5)** - Split players into two balanced teams

## Documentation

- 📖 [Application Guide](docs/CLAUDE.md) - Project architecture and development guide
- 🐳 [Docker Setup](docs/DOCKER.md) - Local Docker deployment
- 🚀 [Production Deployment](docs/DEPLOYMENT-README.md) - Quick deployment guide
- 🔒 [Production Guide](docs/PRODUCTION.md) - Detailed production setup with SSL
- 📝 [Additional Notes](docs/GEMINI.md) - Development notes

## Technology Stack

- **Frontend**: Vanilla JavaScript (ES6 modules), HTML5, CSS3
- **Backend**: Node.js, Express, WebSocket (ws)
- **APIs**: Riot Data Dragon for champion data
- **Infrastructure**: Docker, Nginx, Let's Encrypt SSL
- **Storage**: LocalStorage for client-side persistence

## Project Structure

```
Team Randomizer/
├── docs/                    # Documentation
│   ├── CLAUDE.md           # Development guide
│   ├── DOCKER.md           # Docker guide
│   ├── DEPLOYMENT-README.md # Quick deployment
│   └── PRODUCTION.md       # Production setup
├── css/                     # Stylesheets
│   └── styles.css          # Main styles
├── js/                      # JavaScript modules
│   ├── app.js              # Application entry
│   ├── state.js            # State management
│   ├── parser.js           # Lobby parser
│   ├── randomizer.js       # Algorithms
│   ├── ui.js               # UI rendering
│   ├── display.js          # Team display
│   └── draft.js            # Draft mode
├── images/                  # Assets
│   ├── roles/              # Role icons
│   └── banner.svg          # Banner
├── server.js                # Backend server
├── index.html              # Main HTML
├── package.json            # Dependencies
├── Dockerfile              # Docker image
├── docker-compose.yml      # Dev setup
├── docker-compose.prod.yml # Prod setup
└── nginx.conf              # Nginx config
```

## Development

### Prerequisites

- Node.js 20+ (for backend features)
- Docker (optional, for containerized deployment)

### Local Development

```bash
# Install dependencies
npm install

# Start development server
npm start

# Server runs at http://localhost:8080
```

### Making Changes

- **Frontend**: Edit files in `css/`, `js/`, or `index.html`
- **Backend**: Edit `server.js`
- **Styles**: Edit `css/styles.css`
- **Documentation**: Edit files in `docs/`

No build step required! Just refresh the browser.

## Deployment

### Development (Local)

```bash
docker-compose up -d
```

### Production (draftone.dev-sushi.com)

```bash
# Automated setup
chmod +x setup-ssl.sh
./setup-ssl.sh

# Manual setup
docker-compose -f docker-compose.prod.yml up -d
```

See [PRODUCTION.md](docs/PRODUCTION.md) for detailed deployment instructions.

## API Endpoints

- `GET /` - Serves the main application
- `GET /api/champions` - Fetches champion data from Riot Data Dragon
- `GET /api/draft/default-room` - Gets default draft room ID
- `WebSocket /` - Real-time draft updates

## Browser Support

- Chrome/Edge 90+
- Firefox 88+
- Safari 14+
- Any modern browser with ES6 module support

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

ISC License

## Credits

- **League of Legends**: Riot Games
- **Champion Data**: Riot Data Dragon API
- **Inspired by**: The League community and competitive draft picks

## Support

- 📖 Documentation: See `docs/` folder
- 🐛 Issues: Open a GitHub issue
- 💬 Questions: Check documentation first

---

**Made with ⚔️ for the League of Legends community**

*Not affiliated with Riot Games*

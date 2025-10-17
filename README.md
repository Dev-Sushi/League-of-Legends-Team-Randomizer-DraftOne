# League of Legends Team Randomizer & Multiplayer Draft

A web application for creating randomized League of Legends teams with role assignments and a **real-time multiplayer draft mode** featuring WebSocket synchronization.

## Features

### Core Features
- 🎲 **Team Randomization** - Intelligent team generation with Fisher-Yates shuffle
- 🎯 **Role Assignment** - Automatic role assignment based on player preferences
- 💾 **Persistence** - LocalStorage saves lobby chat and role preferences
- 🎨 **Animated UI** - Smooth shuffle animations and staggered player reveals
- 🔄 **Regenerate** - Instantly create new team arrangements
- 📱 **Responsive** - Works on desktop and mobile
- 🌙 **Draftlol Theme** - Authentic tournament draft styling inspired by draftlol.dawe.gg

### Multiplayer Draft Mode
- 🌐 **Real-Time Synchronization** - WebSocket-based multiplayer draft
- 👥 **Room System** - Create or join rooms with unique codes
- 🎖️ **Host & Captain Roles** - Host controls lobby, captains control team picks
- 🔄 **Team Switching** - Switch between Blue Team, Red Team, or Spectator
- 👁️ **Spectator Mode** - Watch drafts without participating
- 🏆 **Tournament Draft** - Full ban/pick phase with proper draft order
- 💪 **Fearless Draft** - Optional mode preventing champion reuse across matches
- 🔌 **Auto-Reconnect** - Automatic reconnection on disconnect
- 📊 **Live Updates** - See opponent picks and bans in real-time

## Quick Start

### Running Locally (Single User)

**⚠️ Important:** You cannot open `index.html` directly from the file system due to CORS restrictions with ES6 modules. You must use an HTTP server.

```bash
# Using Python (if installed)
python -m http.server 7778

# Using npx (no install needed)
npx http-server -p 7778
```

Open [http://localhost:7778](http://localhost:7778)

### Running Multiplayer Server

For multiplayer draft mode, you need to run the Node.js WebSocket server:

```bash
# Install dependencies
npm install

# Start the server
npm start
```

The server will start on port `7778` by default. Open [http://localhost:7778](http://localhost:7778) in multiple browsers to test multiplayer functionality.

## Game Modes

- **Quick Play (5man)** - Create a single team of up to 5 players
- **Draft Pick (5v5)** - Split players into two balanced teams with single-user draft
- **Multiplayer Draft** - Real-time competitive draft with multiple players

## Multiplayer Usage

### Creating a Room
1. Click **"Multiplayer Draft"**
2. Click **"Create Room"**
3. Share the room code with your opponent
4. As the **host**, you control:
   - Starting the draft
   - Toggling Fearless Draft mode
   - Resetting Fearless Draft sessions

### Joining a Room
1. Click **"Multiplayer Draft"**
2. Enter the room code
3. Click **"Join Room"**
4. Select your team (Blue or Red) or become a Spectator

### Team Switching
- Use the **Team Switcher** dropdown to change teams
- Confirm the switch to take effect
- Host status persists across team switches

### Fearless Draft
- Enables a session where champions cannot be reused across multiple drafts
- Only the host can toggle this mode
- Reset the session to clear banned champions

## Deployment

### Deploying on AMP (CubeCoders)

1. **Create a Generic Instance** in AMP
2. **Configure Node.js**:
   - Set executable: `node`
   - Set arguments: `server.js`
   - Set working directory: `/AMP/node-server/app/`
3. **Upload Files** via FTP or File Manager to `/AMP/node-server/app/`:
   - `server.js`
   - `package.json`
   - `index.html`
   - `/js/` folder
   - `/css/` folder
   - `/images/` folder
   - `/sounds/` folder (if applicable)
4. **Install Dependencies**:
   ```bash
   npm install
   ```
5. **Configure Port**:
   - Set application port in AMP settings
   - Update firewall rules if needed
6. **Start the Server** via AMP control panel

### Deploying on Other Platforms

The application can be deployed on any Node.js hosting platform:

- **Heroku**: Use `Procfile` with `web: node server.js`
- **Railway**: Connect GitHub repo and deploy
- **Render**: Create a Node.js web service
- **DigitalOcean**: Deploy on App Platform or Droplet
- **AWS/Azure/GCP**: Use container services or VM instances

**Environment Variables**:
- `PORT` - Server port (default: 7778)

## Technology Stack

- **Backend**: Node.js, Express.js, WebSocket (ws)
- **Frontend**: Vanilla JavaScript (ES6 modules), HTML5, CSS3
- **APIs**: Riot Data Dragon for champion data
- **Storage**: LocalStorage for client-side persistence
- **Real-time**: WebSocket for multiplayer synchronization

## Development

### Prerequisites

- Node.js (v14 or higher)
- A modern web browser with ES6 module support

### Project Structure

```
├── server.js           # WebSocket server and Express backend
├── package.json        # Node.js dependencies
├── index.html          # Main HTML file
├── css/
│   └── styles.css      # All styles including draftlol theme
├── js/
│   ├── app.js          # Main application logic
│   ├── draft.js        # Draft mode logic
│   ├── multiplayer.js  # WebSocket client & multiplayer handling
│   └── data.js         # Champion data management
└── images/             # Champion icons and assets
```

### Making Changes

- **Backend**: Edit `server.js` for server logic
- **Frontend**: Edit files in `css/`, `js/`, or `index.html`
- **Styles**: Edit `css/styles.css`

No build step required! Just refresh the browser after changes.

### Testing Multiplayer Locally

1. Start the server: `npm start`
2. Open multiple browser windows/tabs at `http://localhost:7778`
3. Create a room in one window
4. Join with the room code in other windows
5. Test team switching, drafting, and spectating

## Architecture

### Server-Side (server.js)
- Express.js serves static files
- WebSocket server manages rooms and draft state
- Room-based multiplayer with host/captain roles
- Draft state synchronization across clients
- Fearless Draft session management

### Client-Side (js/multiplayer.js)
- WebSocket connection management
- Auto-reconnect on disconnect
- Real-time UI updates
- Room status notifications
- Team switching logic

## API Reference

### WebSocket Messages

**Client → Server**:
- `create_room` - Create a new draft room
- `join_room` - Join an existing room
- `start_draft` - Start the draft (host only)
- `draft_action` - Make a pick or ban
- `switch_team` - Switch between teams or spectator
- `toggle_fearless` - Enable/disable Fearless Draft (host only)
- `reset_fearless` - Reset Fearless Draft session (host only)

**Server → Client**:
- `room_created` - Room created successfully
- `room_joined` - Successfully joined room
- `opponent_joined` - Opponent joined the room
- `draft_started` - Draft has started
- `draft_update` - Draft state updated
- `team_switched` - Team switch confirmed
- `fearless_toggled` - Fearless mode toggled
- `room_update` - Player list updated
- `error` - Error message

---

**Made with ⚔️ for the League of Legends community**

*Not affiliated with Riot Games*

**Developed by Dev-Sushi**

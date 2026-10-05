# ⚡ BuzzParty - Live Multiplayer Party Trivia & Buzzer Game

**BuzzParty** is a high-energy, Jackbox & Kahoot-style real-time multiplayer party game. Anyone can launch the Host display on a TV or laptop screen, generate a 4-letter Room Code with a dynamic QR code, and have friends join on their smartphones or laptops with **zero logins, zero app installs, and zero friction**.

---

## 🎮 How to Play

1. **Host a Game**:
   - Open `http://localhost:3000` (or your public cloud URL) on the big screen or laptop.
   - A unique 4-character **Room Code** (e.g. `S8ZQ`) and a scannable **QR Code** appear automatically.
2. **Players Join**:
   - Players scan the QR code with their phone camera or visit `http://localhost:3000/player.html`.
   - Enter their nickname and choose a fun emoji avatar (⚡, 🚀, 🦊, 👾, 👑, 🍕).
3. **Gameplay**:
   - **Speed Trivia Mode**: Multiple-choice questions (4 vibrant color pads ▲ ◆ ● ■). Faster answers yield higher bonus points and streak multipliers!
   - **Lightning Buzzer Mode**: First player to slam the giant glowing buzzer locks in the right to answer.
   - **Live Reaction Cannon**: Players can fire emoji reactions (🔥, 🤯, 😂, 💩, 🎯, 🚀) that float dynamically across the host's screen in real time.
   - **Leaderboard & Podium**: Animated rank races, fire streak badges, and a 3-tier Olympic podium with celebratory confetti and victory fanfares.

---

## 🛠️ Tech Stack & Architecture

- **Backend**: Node.js + Express + Socket.io for low-latency WebSocket synchronization and room management.
- **Frontend Host**: Vanilla HTML5, Neo-Arcade Glassmorphism CSS, and responsive layout for 1080p/4K TVs and laptops.
- **Frontend Mobile Controller**: Tactile, touch-optimized high-contrast pad grid, haptic vibration support, and reaction dock.
- **Audio Engine**: Synthesized **Web Audio API** sound engine (`public/audio.js`) providing zero-latency chimes, buzzers, ticks, whooshes, and victory fanfares with zero external audio assets.
- **Visuals**: Embedded lightweight QR code generator and canvas celebration confetti engine.

---

## 🚀 Running Locally

1. Open your terminal in this directory:
   ```bash
   cd "C:\Users\vedpr\.gemini\antigravity-ide\scratch\buzzparty-multiplayer"
   ```
2. Start the game server:
   ```bash
   npm start
   ```
3. Open in your browser:
   - **Host Screen**: [http://localhost:3000](http://localhost:3000)
   - **Player Screen**: [http://localhost:3000/player.html](http://localhost:3000/player.html)

---

## 🌐 Instant Public URL Sharing (Play with Friends Anywhere)

### Option 1: Instant Local Tunnel (e.g., ngrok or localtunnel)
If you want to play right now over the internet with friends on their phones:
```bash
npx localtunnel --port 3000
```
Share the generated public URL!

### Option 2: 1-Click Free Cloud Deployment (Render / Railway / Glitch)
1. Push this folder to a GitHub repository.
2. Link the repository to [Render.com](https://render.com) or [Railway.app](https://railway.app):
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Environment Variable**: `PORT=3000` (optional, auto-assigned)
3. Share your live `.onrender.com` or `.up.railway.app` URL with anyone!

---

## 🧪 Testing & Verification

Run the automated multi-client integration test to simulate 2 players joining, buzzing, answering, and syncing:
```bash
node test_game.js
```

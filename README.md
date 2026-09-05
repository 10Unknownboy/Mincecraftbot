# Minecraft AFK Bot & Web Console

A robust, headless Minecraft bot built with [Mineflayer](https://github.com/PrismarineJS/mineflayer) designed to keep your account online 24/7. It includes built-in anti-AFK mechanics and a live web-based console to monitor the server and send commands from your browser.

## Features

- **Anti-AFK System**: Automatically performs randomized movements (looking around, walking, jumping) every 30 seconds to prevent being kicked for inactivity.
- **Live Web Console**: Provides a lightweight web interface to view real-time chat, death messages, and join/leave events. 
- **Remote Chat Control**: Send chat messages and commands directly to the Minecraft server from the web console.
- **Smart Auto-Reconnect**: Automatically attempts to reconnect if kicked or disconnected. Includes smart backoff specifically for `duplicate_login` errors (adding 30 seconds per attempt to let ghost connections time out).
- **Pause/Resume Reconnects**: Easily toggle the auto-reconnect feature directly from the web console UI.

## Prerequisites

- [Node.js](https://nodejs.org/) (v16 or newer recommended)
- A Minecraft account (Premium or cracked/offline depending on your target server)

## Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/10Unknownboy/Mincecraftbot.git
   cd Mincecraftbot
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

## Configuration

Configuration is handled via environment variables. You can set these in your hosting environment (e.g., Render dashboard) or export them before running.

| Variable | Description | Default |
|----------|-------------|---------|
| `MC_HOST` | The IP or domain of the Minecraft server | `lpsconf.falix.gg` |
| `MC_USERNAME` | The username for the bot | `sp.singh_` |
| `MC_VERSION` | The Minecraft version (leave empty for auto-detect) | `false` (Auto) |
| `PORT` | The port for the web console | `3000` |

## Usage

Start the bot by running:

```bash
node bot.js
```

Once running, open your web browser and navigate to `http://localhost:3000` (or your deployment URL) to access the Live Web Console.

## Deployment (Render.com)

This bot is fully compatible with Render Web Services and handles port binding seamlessly.

1. Create a new **Web Service** on Render.
2. Connect your GitHub repository.
3. Set the Build Command to `npm install`.
4. Set the Start Command to `node bot.js`.
5. Add your Environment Variables (`MC_HOST`, `MC_USERNAME`, etc.).
6. Deploy! Render will automatically map the `$PORT` so your web console is easily accessible via your `.onrender.com` URL.

## License

ISC

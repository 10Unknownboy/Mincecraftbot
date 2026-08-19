const mineflayer = require('mineflayer')
const express = require('express')
const http = require('http')
const { Server } = require('socket.io')

// AI modules removed

const app = express()
const server = http.createServer(app)
const io = new Server(server)

const PORT = process.env.PORT || 3000

let logs = []
let bot
let moveInterval = null   // track teleport loop
let idleChatInterval = null  // periodic idle chatter
let lastWhisperTarget = null // track who was last whispered for the invite
let reconnectDelay = 5000    // dynamic reconnect delay
let shouldReconnect = true   // toggle to auto reconnect
let reconnectTimer = null    // track the timeout
let isConnecting = false     // prevent double connections




function log(message) {
  console.log(message)
  logs.push(message)
  io.emit('log', message)
}

// --- Event detection helpers ---

const DEATH_PATTERNS = [
  'was slain by', 'was shot by', 'was killed by', 'drowned', 'blew up',
  'hit the ground too hard', 'fell from', 'burned to death', 'tried to swim in lava',
  'suffocated', 'starved to death', 'withered away', 'was pummeled by',
  'was fireballed by', 'walked into fire', 'was struck by lightning',
  'went off with a bang', 'was impaled by', 'was squished', 'experienced kinetic energy'
]

function isDeathMessage(message) {
  const lower = message.toLowerCase()
  return DEATH_PATTERNS.some(p => lower.includes(p))
}

function isAdvancementMessage(message) {
  return message.includes('has made the advancement') ||
    message.includes('has completed the challenge') ||
    message.includes('has reached the goal')
}

// --- Coordinate query detection ---

function isCoordinateQuery(prompt) {
  const lower = prompt.toLowerCase().trim()
  return lower.startsWith('coords') ||
    lower.startsWith('where is') ||
    lower.startsWith('where are') ||
    lower.startsWith('location') ||
    lower.startsWith('coords of')
}

// --- Bot creation ---

function createBot() {
  if (isConnecting) return;
  isConnecting = true;

  const user = process.env.MC_USERNAME || 'sp.singh_'

  bot = mineflayer.createBot({
    host: process.env.MC_HOST || 'lpsconf.falix.gg',
    username: user,
    version: process.env.MC_VERSION || false
  })

  bot.on('spawn', () => {
    isConnecting = false;
    reconnectDelay = 5000; // Reset delay after successful connection
    log('sp.singh_ Entered The Island <3')

    bot.chat('Hello Kids, missed me? <3')


    // prevent duplicate intervals
    if (moveInterval) {
      clearInterval(moveInterval)
      moveInterval = null
    }
    if (idleChatInterval) {
      clearInterval(idleChatInterval)
      idleChatInterval = null
    }

    // optional: wait 5 seconds before starting loop
    setTimeout(() => {

      moveInterval = setInterval(() => {
        // Random movement
        const yaw = Math.random() * Math.PI * 2
        bot.look(yaw, 0)
        bot.setControlState('forward', true)
        
        if (Math.random() < 0.5) {
          bot.setControlState('jump', true)
        }

        // Stop moving after 1-3 seconds
        setTimeout(() => {
          bot.clearControlStates()
        }, 1000 + Math.random() * 2000)

        log('Executed: random movement')
      }, 30000) // 30 seconds

    }, 5000)

  })

  bot.on('chat', (username, message) => {
    log(`[CHAT] ${username}: ${message}`)
  })

  bot.on('whisper', (username, message) => {
    log(`[WHISPER] ${username}: ${message}`)
    if (username === bot.username) return

    if (username === lastWhisperTarget) {
      const lower = message.toLowerCase().trim()
      if (lower === 'yes' || lower === 'y' || lower.includes('yes')) {
        bot.whisper(username, 'I am on my way...')
        log(`[WHISPER] Accepted invite from ${username}.`)
        lastWhisperTarget = null
      } else if (lower === 'no' || lower === 'n' || lower.includes('no')) {
        bot.whisper(username, 'Better luck next time.')
        log(`[WHISPER] Declined invite from ${username}.`)
        lastWhisperTarget = null
      }
    }
  })

  bot.on('kicked', reason => {
    log("Kicked: " + reason)
    if (String(reason).includes('duplicate_login')) {
      reconnectDelay += 30000
      if (reconnectDelay > 300000) reconnectDelay = 300000 
      log(`[SYSTEM] Duplicate login detected. Reconnect delay is now ${reconnectDelay / 1000} seconds.`)
    }
  })
  bot.on('error', err => log("Error: " + err))

  bot.on('playerJoined', (player) => {
    if (player.username === bot.username) return
    log(`[EVENT] Player joined: ${player.username}`)
  })

  bot.on('end', () => {
    isConnecting = false;
    if (moveInterval) {
      clearInterval(moveInterval)
      moveInterval = null
    }

    if (shouldReconnect) {
      if (reconnectTimer) clearTimeout(reconnectTimer)
      log(`Bot disconnected... reconnecting in ${reconnectDelay / 1000} seconds`)
      bot = null
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null
        createBot()
      }, reconnectDelay)
    } else {
      bot = null
      log(`Bot disconnected... reconnect is currently PAUSED.`)
    }
  })
}

// Health check endpoint for UptimeRobot
app.get('/health', (req, res) => {
  res.status(200).send('OK');
});

// Web console page
app.get('/', (req, res) => {
  res.send(`
  <html>
  <head>
    <title>sp.singh_ Bot Console</title>
    <style>
      body { background: black; color: #00ff00; font-family: monospace; padding: 20px; }
      h2 { border-bottom: 1px solid #00ff00; padding-bottom: 10px; }
      #console { height: 500px; overflow-y: scroll; border: 1px solid #00ff00; padding: 10px; margin-bottom: 15px; background: #080808; }
      .log-line { display: flex; justify-content: space-between; border-bottom: 1px solid #111; padding: 2px 0; }
      .log-msg { flex: 1; overflow-wrap: anywhere; }
      .log-time { color: #008800; font-size: 0.8em; margin-left: 20px; white-space: nowrap; }
      .controls { display: flex; gap: 10px; }
      #cmd { flex: 1; background: black; color: #00ff00; border: 1px solid #00ff00; padding: 8px; }
      button { background: #004400; color: #00ff00; border: 1px solid #00ff00; padding: 8px 15px; cursor: pointer; }
      button:hover { background: #006600; }
    </style>
  </head>
  <body>

  <h2>sp.singh_ Bot Console</h2>

  <div id="console"></div>

  <div class="controls">
    <input id="cmd" placeholder="Type Minecraft command..." autocomplete="off">
    <button onclick="sendCmd()">Send</button>
    <button onclick="clearConsole()" style="background:#440000; border-color:#ff0000; color:#ff0000;">Clear</button>
    <button id="reconnectBtn" onclick="toggleReconnect()" style="background:#444400; border-color:#ffff00; color:#ffff00;">Stop Reconnecting</button>
  </div>

  <script src="/socket.io/socket.io.js"></script>

  <script>
  const socket = io()
  const consoleDiv = document.getElementById("console")

  socket.on("init", logs => {
    consoleDiv.innerHTML = ''
    logs.forEach(msg => addLine(msg))
  })

  socket.on("log", msg => {
    addLine(msg)
  })

  function addLine(msg){
    const line = document.createElement("div")
    line.className = "log-line"
    
    const textSpan = document.createElement("span")
    textSpan.className = "log-msg"
    textSpan.textContent = msg
    
    const timeSpan = document.createElement("span")
    timeSpan.className = "log-time"
    timeSpan.textContent = new Date().toLocaleTimeString()
    
    line.appendChild(textSpan)
    line.appendChild(timeSpan)
    
    consoleDiv.appendChild(line)
    consoleDiv.scrollTop = consoleDiv.scrollHeight
  }

  function sendCmd(){
    const input = document.getElementById("cmd")
    const cmd = input.value
    if(cmd.trim() !== ""){
      socket.emit("command", cmd)
      input.value=""
    }
  }

  function clearConsole(){
    consoleDiv.innerHTML = ''
    socket.emit("clear-logs")
  }

  document.getElementById("cmd").addEventListener("keydown", e=>{
    if(e.key === "Enter") sendCmd()
  })

  let isReconnecting = true;
  function toggleReconnect() {
    isReconnecting = !isReconnecting;
    const btn = document.getElementById("reconnectBtn");
    btn.textContent = isReconnecting ? "Stop Reconnecting" : "Start Reconnecting";
    socket.emit("toggle-reconnect", isReconnecting);
  }
  </script>

  </body>
  </html>
  `)
})

// Web socket connection
io.on('connection', socket => {

  socket.emit('init', logs)

  socket.on('command', cmd => {
    if (bot && bot.entity) {
      bot.chat(cmd)
      log("[WEB COMMAND] " + cmd)
    } else {
      log("[SYSTEM] Bot is not spawned yet. Please wait.")
    }
  })

  socket.on('clear-logs', () => {
    logs = []
    log("[SYSTEM] Web console logs cleared")
  })

  socket.on('toggle-reconnect', (reconnect) => {
    shouldReconnect = reconnect
    log(`[SYSTEM] Auto-reconnect is now ${reconnect ? 'ENABLED' : 'DISABLED'}`)
    
    // If it was waiting to reconnect and we disabled it, clear the timer
    if (!shouldReconnect && reconnectTimer) {
      clearTimeout(reconnectTimer)
      reconnectTimer = null
      log('[SYSTEM] Cancelled pending reconnect attempt.')
    }
    
    // If it was paused and bot is dead/disconnected, we can try to start it immediately or just wait
    if (shouldReconnect && !bot) {
      log('[SYSTEM] Starting bot connection...')
      createBot()
    }
  })

})

// Start server FIRST (important for Render)
server.listen(PORT, () => {
  console.log("Web console running on port " + PORT)

  createBot()
})

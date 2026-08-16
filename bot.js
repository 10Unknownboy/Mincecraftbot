const mineflayer = require('mineflayer')
const express = require('express')
const http = require('http')
const { Server } = require('socket.io')

// AI modules
const memory = require('./memory')
const coordMemory = require('./coordinateMemory')
const { getAIResponse, splitMessage, MAX_RESPONSE_LENGTH } = require('./ai')

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
    host: process.env.MC_HOST || 'lpsconf.play.hosting',
    username: user,
    version: process.env.MC_VERSION || false
  })

  bot.on('spawn', () => {
    isConnecting = false;
    log('sp.singh_ Entered The Island <3')

    bot.chat('Hello Kids, missed me? <3')

    try {
      if (!bot.viewer) {
        setupViewer(bot)
        log('Started integrated Prismarine Viewer on /viewer')
      }
    } catch (err) {
      log('Viewer already running or error: ' + err.message)
    }

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

    // --- Idle chatter: bot talks on its own every 2-5 minutes ---
    startIdleChatter()

  })

  bot.on('chat', (username, message) => {

    log(`[CHAT] ${username}: ${message}`)

    // --- Store everything in session memory ---
    memory.addMessage(username, message)
    memory.addPlayer(username)

    // --- Detect and store coordinates ---
    const coordEntry = coordMemory.detectAndStore(username, message)
    if (coordEntry) {
      const loc = coordEntry.locationName ? ` (${coordEntry.locationName})` : ''
      log(`[COORDS] Stored: ${coordEntry.coordinates.x} ${coordEntry.coordinates.y} ${coordEntry.coordinates.z}${loc} from ${username}`)
    }

    // --- Detect death events ---
    if (isDeathMessage(message)) {
      memory.addEvent('player_death', message, username)
      log(`[EVENT] Death detected: ${message}`)

      // AI responds to deaths (70% chance)
      if (Math.random() < 0.90) {
        handleAIResponse(`A player just died: "${message}". Comment on this death.`, username)
      }
    }

    // --- Detect advancement events ---
    if (isAdvancementMessage(message)) {
      memory.addEvent('player_advancement', message, username)
      log(`[EVENT] Advancement detected: ${message}`)

      // AI responds to advancements (70% chance)
      if (Math.random() < 0.90) {
        handleAIResponse(`A player got an advancement: "${message}". Comment on it.`, username)
      }
    }

    // Skip self-messages for AI triggers
    if (username === bot.username) return



    // --- MENTION TRIGGER: "sp.singh_" mentioned in chat ---
    if (message.toLowerCase().includes('sp.singh_')) {
      log(`[AI] Mentioned by ${username}: ${message}`)
      handleAIResponse(`Player ${username} mentioned you in chat: "${message}". Respond in character.`, username)
      return
    }

    // --- CHECK FOR PENDING LONG RESPONSE CONFIRMATION ---


    // --- AI PROMPT TRIGGER: messages starting with ? ---
    if (message.startsWith('?')) {
      const prompt = message.substring(1).trim()
      if (prompt.length === 0) return

      log(`[AI] Prompt from ${username}: ${prompt}`)

      // Check if this is a coordinate query
      if (isCoordinateQuery(prompt)) {
        const results = coordMemory.searchCoordinates(prompt.replace(/^(coords|where is|where are|location|coords of)\s*/i, '').trim())
        if (results.length > 0) {
          const coordContext = results.map(c => {
            const loc = c.locationName ? `${c.locationName}: ` : ''
            return `${loc}${c.coordinates.x} ${c.coordinates.y} ${c.coordinates.z} (from ${c.player})`
          }).join(', ')
          handleAIResponse(`Player ${username} is asking about coordinates. Stored coords: ${coordContext}. Their question: "${prompt}". Use coordinate data and your chat memory to answer.`, username)
        } else {
          handleAIResponse(`Player ${username} asked about coordinates: "${prompt}" but no coordinates are stored yet. Let them know. Check chat memory for any mentioned locations.`, username)
        }
      } else {
        handleAIResponse(`Player ${username} asks: "${prompt}". Use your full chat memory and session knowledge to answer. Reference things from past chat if relevant.`, username)
      }
      return
    }


    // --- RANDOM CHAT COMMENTING: 40% chance ---
    if (Math.random() < 0.40) {
      log(`[AI] Random comment triggered by ${username}'s message`)
      const recentMsgs = memory.getRecentMessages(10)
      const chatContext = recentMsgs.map(m => `${m.player}: ${m.text}`).join('\n')
      handleAIResponse(`Here is recent chat:\n${chatContext}\n\nComment on the conversation naturally. You are observing server chat. Be witty and engaging.`, username)
    }

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
      log('[SYSTEM] Duplicate login detected. Increasing reconnect delay to 30 seconds.')
      reconnectDelay = 30000
    }
  })
  bot.on('error', err => log("Error: " + err))

  // --- JOIN/LEAVE EVENTS ---
  bot.on('playerJoined', (player) => {
    if (player.username === bot.username) return
    log(`[EVENT] Player joined: ${player.username}`)
    memory.addPlayer(player.username)
    handleAIResponse(`Player ${player.username} just joined the server. Welcome them to the island in your usual creepy/seductive manner.`, player.username)
  })

  bot.on('playerLeft', (player) => {
    if (player.username === bot.username) return
    log(`[EVENT] Player left: ${player.username}`)
    handleAIResponse(`Player ${player.username} just left the server. Say something sarcastic or mocking about their departure.`, player.username)
  })

  bot.on('end', () => {
    isConnecting = false;
    // Stop all intervals when bot disconnects
    if (moveInterval) {
      clearInterval(moveInterval)
      moveInterval = null
    }
    if (idleChatInterval) {
      clearInterval(idleChatInterval)
      idleChatInterval = null
    }

    // Reset all session memory on disconnect
    memory.resetMemory()
    coordMemory.resetCoordinates()
    log('[MEMORY] Session memory cleared on disconnect')

    if (shouldReconnect) {
      if (reconnectTimer) clearTimeout(reconnectTimer)
      log(`Bot disconnected... reconnecting in ${reconnectDelay / 1000} seconds`)
      bot = null
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null
        createBot()
      }, reconnectDelay)
      reconnectDelay = 5000 // reset to default for next time
    } else {
      bot = null
      log(`Bot disconnected... reconnect is currently PAUSED.`)
    }
  })
}

/**
 * Handle an AI response asynchronously.
 * Logic:
 * 1. If response <= 250, send directly.
 * 2. If prompt asks for "detailed", send all messages immediately.
 * 3. Otherwise, 30% chance to ask for multi-message permission.
 * 4. If 30% chance fails, just send the first 250 chars.
 */
async function handleAIResponse(prompt, triggerPlayer) {
  try {
    const response = await getAIResponse(prompt, memory, coordMemory)
    if (!response || !bot) return

    log(`[AI] Raw Response (${response.length} chars): ${response}`)

    // Short response — send directly
    if (response.length <= MAX_RESPONSE_LENGTH) {
      if (triggerPlayer && prompt.includes('WHISPER_INVITE')) {
        bot.whisper(triggerPlayer, response)
        lastWhisperTarget = triggerPlayer
      } else {
        bot.chat(response)
      }
      return
    }

    // Long response logic - just send the first part and limit the message
    const parts = splitMessage(response, MAX_RESPONSE_LENGTH)
    
    log(`[AI] Response too long, sending only the first part.`)
    if (triggerPlayer && prompt.includes('WHISPER_INVITE')) {
      bot.whisper(triggerPlayer, parts[0])
      lastWhisperTarget = triggerPlayer
    } else {
      bot.chat(parts[0])
    }

  } catch (err) {
    log(`[AI] Error generating response: ${err.message}`)
  }
}

/**
 * Idle chatter: the bot periodically comments on its own
 * every 2-5 minutes if there has been recent chat activity.
 */
function startIdleChatter() {
  // Random interval between 2-5 minutes (120000 - 300000 ms)
  function scheduleNext() {
    const delay = 120000 + Math.floor(Math.random() * 180000)
    idleChatInterval = setTimeout(() => {
      const recentMsgs = memory.getRecentMessages(15)
      const onlinePlayers = Object.keys(bot.players).filter(name => name !== bot.username)

      if (onlinePlayers.length > 0 && recentMsgs.length > 0 && bot) {
        log('[AI] Idle chatter triggered')
        const chatContext = recentMsgs.map(m => `${m.player}: ${m.text}`).join('\n')
        const events = memory.getEvents().slice(-5)
        const eventContext = events.length > 0
          ? '\nRecent events: ' + events.map(e => e.description).join(', ')
          : ''

        const idlePrompts = [
          `You are watching server chat. Here is recent activity:\n${chatContext}${eventContext}\n\nSay something unprompted about what you have been observing. Be opinionated and engaging.`,
          `Recent server chat:\n${chatContext}${eventContext}\n\nDrop a random piece of Minecraft wisdom, strategy tip, or sarcastic observation about what players are doing.`,
          `Chat log:\n${chatContext}${eventContext}\n\nShare a thought about the server. Maybe brag about your builds, mock someone, or give unsolicited advice.`,
          `Observing chat:\n${chatContext}${eventContext}\n\nMake a provocative or interesting comment to stir up conversation. Be your usual dominant self.`,
          `WHISPER_INVITE: Generate a secretive, seductive, and creepy whisper invite to "the island". Sound like sp.singh_. Be cryptic and playful.`
        ]

        const roll = Math.random()
        let prompt
        let targetPlayer = null

        // 30% chance to whisper a random player instead of public chat
        if (roll < 0.3) {
          const players = onlinePlayers
          if (players.length > 0) {
            targetPlayer = players[Math.floor(Math.random() * players.length)]
            prompt = idlePrompts[4] // WHISPER_INVITE
          } else {
            prompt = idlePrompts[Math.floor(Math.random() * 4)] // fall back to public
          }
        } else {
          prompt = idlePrompts[Math.floor(Math.random() * 4)]
        }

        handleAIResponse(prompt, targetPlayer)
      }
      scheduleNext()
    }, delay)
  }
  scheduleNext()
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
    <button onclick="window.open('/viewer/', '_blank')" style="background:#000044; border-color:#0000ff; color:#0000ff;">Open Viewer</button>
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

const { WorldView } = require('prismarine-viewer/viewer')
const EventEmitter = require('events')

let viewerIo = null
let viewerSockets = []

function initViewerServer() {
  if (viewerIo) return
  const prefix = '/viewer'
  const { setupRoutes } = require('prismarine-viewer/lib/common')
  setupRoutes(app, prefix)
  viewerIo = new Server(server, { path: prefix + '/socket.io' })
}

function setupViewer(bot) {
  initViewerServer()
  
  // Close existing viewer connections before attaching new bot
  for (const socket of viewerSockets) socket.disconnect()
  viewerIo.removeAllListeners('connection')
  viewerSockets = []
  
  const primitives = {}
  bot.viewer = new EventEmitter()

  bot.viewer.erase = (id) => {
    delete primitives[id]
    for (const socket of viewerSockets) socket.emit('primitive', { id })
  }
  bot.viewer.drawBoxGrid = (id, start, end, color = 'aqua') => {
    primitives[id] = { type: 'boxgrid', id, start, end, color }
    for (const socket of viewerSockets) socket.emit('primitive', primitives[id])
  }
  bot.viewer.drawLine = (id, points, color = 0xff0000) => {
    primitives[id] = { type: 'line', id, points, color }
    for (const socket of viewerSockets) socket.emit('primitive', primitives[id])
  }
  bot.viewer.drawPoints = (id, points, color = 0xff0000, size = 5) => {
    primitives[id] = { type: 'points', id, points, color, size }
    for (const socket of viewerSockets) socket.emit('primitive', primitives[id])
  }

  viewerIo.on('connection', (socket) => {
    socket.emit('version', bot.version)
    viewerSockets.push(socket)

    const worldView = new WorldView(bot.world, 6, bot.entity.position, socket)
    worldView.init(bot.entity.position)

    worldView.on('blockClicked', (block, face, button) => {
      bot.viewer.emit('blockClicked', block, face, button)
    })

    for (const id in primitives) socket.emit('primitive', primitives[id])

    function botPosition () {
      const packet = { pos: bot.entity.position, yaw: bot.entity.yaw, addMesh: true, pitch: bot.entity.pitch }
      socket.emit('position', packet)
      worldView.updatePosition(bot.entity.position)
    }

    bot.on('move', botPosition)
    worldView.listenToBot(bot)
    socket.on('disconnect', () => {
      bot.removeListener('move', botPosition)
      worldView.removeListenersFromBot(bot)
      viewerSockets.splice(viewerSockets.indexOf(socket), 1)
    })
  })

  bot.viewer.close = () => {
    for (const socket of viewerSockets) socket.disconnect()
  }
}

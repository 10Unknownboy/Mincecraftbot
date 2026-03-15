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
let tpInterval = null   // track teleport loop
let idleChatInterval = null  // periodic idle chatter

// Track pending long responses awaiting player confirmation
// Map: playerName -> { responseText, timestamp, timeout }
const pendingLongResponses = new Map()

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

  bot = mineflayer.createBot({
    host: process.env.MC_HOST || 'goondust.play.hosting',
    username: process.env.MC_USERNAME || 'Epstein',
    version: false
  })

  bot.on('spawn', () => {

    log('Epstein Entered The Island <3')

    bot.chat('Hello Kids, missed me? <3')

    // prevent duplicate intervals
    if (tpInterval) {
      clearInterval(tpInterval)
      tpInterval = null
    }
    if (idleChatInterval) {
      clearInterval(idleChatInterval)
      idleChatInterval = null
    }

    // optional: wait 5 seconds before starting loop
    setTimeout(() => {

      tpInterval = setInterval(() => {
        bot.chat('/tp Epstein @r')
        log('Executed: /tp Epstein @r')
      }, 600000) // 10 minutes

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

    // --- CHECK FOR PENDING LONG RESPONSE CONFIRMATION ---
    const pending = pendingLongResponses.get(username)
    if (pending) {
      const lower = message.toLowerCase().trim()
      const positives = ['yes', 'y', 'ok', 'sure', 'send', 'go ahead', 'do it', 'yeah', 'yep', 'yea', 'ye']
      const negatives = ['no', 'n', 'cancel', 'dont', "don't", 'nah', 'nope', 'stop']

      if (positives.includes(lower)) {
        log(`[AI] ${username} confirmed long response — sending ${pending.parts.length} messages`)
        clearTimeout(pending.timeout)
        pendingLongResponses.delete(username)
        sendMultiMessage(pending.parts)
        return
      } else if (negatives.includes(lower)) {
        log(`[AI] ${username} declined long response`)
        clearTimeout(pending.timeout)
        pendingLongResponses.delete(username)
        bot.chat('Alright, keeping it to myself then.')
        return
      }
    }

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

  bot.on('kicked', reason => log("Kicked: " + reason))
  bot.on('error', err => log("Error: " + err))

  bot.on('end', () => {

    // Stop all intervals when bot disconnects
    if (tpInterval) {
      clearInterval(tpInterval)
      tpInterval = null
    }
    if (idleChatInterval) {
      clearInterval(idleChatInterval)
      idleChatInterval = null
    }

    // Reset all session memory on disconnect
    memory.resetMemory()
    coordMemory.resetCoordinates()
    log('[MEMORY] Session memory cleared on disconnect')

    log('Bot disconnected... reconnecting in 5 seconds')
    setTimeout(createBot, 5000)
  })
}

/**
 * Handle an AI response asynchronously.
 * If response is short, sends directly.
 * If response is long, asks the player for permission to send multiple messages.
 */
async function handleAIResponse(prompt, triggerPlayer) {
  try {
    const response = await getAIResponse(prompt, memory, coordMemory)
    if (!response || !bot) return

    log(`[AI] Response (${response.length} chars): ${response}`)

    // Short response — send directly
    if (response.length <= MAX_RESPONSE_LENGTH) {
      bot.chat(response)
      return
    }

    // Long response — need confirmation from the player
    const parts = splitMessage(response, MAX_RESPONSE_LENGTH)

    // If no triggerPlayer (idle chat, etc.), just send first part
    if (!triggerPlayer) {
      bot.chat(parts[0])
      return
    }

    // Store the pending response and ask for permission
    // Clear any existing pending for this player
    const existing = pendingLongResponses.get(triggerPlayer)
    if (existing) clearTimeout(existing.timeout)

    const timeout = setTimeout(() => {
      pendingLongResponses.delete(triggerPlayer)
      log(`[AI] Pending response for ${triggerPlayer} expired (30s timeout)`)
    }, 30000)

    pendingLongResponses.set(triggerPlayer, {
      parts,
      responseText: response,
      timestamp: Date.now(),
      timeout
    })

    bot.chat(`That's a long answer (${parts.length} messages). Want me to send it all? Say yes or no.`)
    log(`[AI] Asked ${triggerPlayer} for permission to send ${parts.length} messages`)

  } catch (err) {
    log(`[AI] Error generating response: ${err.message}`)
  }
}

/**
 * Send multiple messages sequentially with a 1-second delay between each.
 */
function sendMultiMessage(parts) {
  parts.forEach((part, i) => {
    setTimeout(() => {
      if (bot) {
        bot.chat(part)
        log(`[AI] Sent part ${i + 1}/${parts.length}: ${part}`)
      }
    }, i * 1200) // 1.2s delay between messages
  })
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
      if (recentMsgs.length > 0 && bot) {
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
          `Observing chat:\n${chatContext}${eventContext}\n\nMake a provocative or interesting comment to stir up conversation. Be your usual dominant self.`
        ]

        const prompt = idlePrompts[Math.floor(Math.random() * idlePrompts.length)]
        handleAIResponse(prompt, null)
      }
      scheduleNext()
    }, delay)
  }
  scheduleNext()
}

// Web console page
app.get('/', (req, res) => {
  res.send(`
  <html>
  <body style="background:black;color:#00ff00;font-family:monospace;padding:20px">

  <h2>Epstein Bot Console</h2>

  <div id="console" style="height:400px;overflow:auto;border:1px solid #00ff00;padding:10px;margin-bottom:10px"></div>

  <input id="cmd" placeholder="Type Minecraft command..." 
  style="width:80%;background:black;color:#00ff00;border:1px solid #00ff00;padding:5px">

  <button onclick="sendCmd()">Send</button>

  <script src="/socket.io/socket.io.js"></script>

  <script>
  const socket = io()
  const consoleDiv = document.getElementById("console")

  socket.on("init", logs=>{
    logs.forEach(addLine)
  })

  socket.on("log", msg=>{
    addLine(msg)
  })

  function addLine(msg){
    const line = document.createElement("div")
    line.textContent = msg
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

  document.getElementById("cmd").addEventListener("keydown", e=>{
    if(e.key === "Enter") sendCmd()
  })
  </script>

  </body>
  </html>
  `)
})

// Web socket connection
io.on('connection', socket => {

  socket.emit('init', logs)

  socket.on('command', cmd => {
    if (bot) {
      bot.chat(cmd)
      log("[WEB COMMAND] " + cmd)
    }
  })

})

// Start server FIRST (important for Render)
server.listen(PORT, () => {
  console.log("Web console running on port " + PORT)

  createBot()
})
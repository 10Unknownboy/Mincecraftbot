const mineflayer = require('mineflayer')
const express = require('express')
const http = require('http')
const { Server } = require('socket.io')

const app = express()
const server = http.createServer(app)
const io = new Server(server)

const PORT = process.env.PORT || 3000

let logs = []
let bot

function log(message){
  console.log(message)
  logs.push(message)
  io.emit('log', message)
}

function createBot() {

  bot = mineflayer.createBot({
    host: 'goondust.play.hosting',
    username: 'Epstein',
    version: false
  })

  bot.on('spawn', () => {
    log('Epstein Entered The Island <3')

    bot.chat('Hello Kids, missed me? <3')

    setInterval(() => {
      bot.chat('/tp Epstein @r')
      log('Executed: /tp Epstein @r')
    }, 600000)
  })

  bot.on('chat', (username, message) => {

    log(`[CHAT] ${username}: ${message}`)

    if (username === bot.username) return

    if (message === 'Goon') {
      bot.chat('AHHHHHHHHHHHHHHHHHHHHHHHH')
    }

  })

  bot.on('kicked', reason => log("Kicked: " + reason))
  bot.on('error', err => log("Error: " + err))

  bot.on('end', () => {
    log('Bot disconnected... reconnecting in 5 seconds')
    setTimeout(createBot, 5000)
  })
}

// Web console page
app.get('/', (req,res)=>{
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
    if(bot){
      bot.chat(cmd)
      log("[WEB COMMAND] " + cmd)
    }
  })

})

// Start server FIRST (important for Render)
server.listen(PORT, () => {
  console.log("Web console running on port " + PORT)

  // start bot after server starts
  createBot()
})
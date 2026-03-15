// memory.js — Session memory for the Minecraft bot
// All data lives in-process and resets on disconnect/restart

let messages = []
let players = []
let events = []

function addMessage(player, text) {
  messages.push({
    player,
    text,
    timestamp: Date.now()
  })
  addPlayer(player)
}

function addPlayer(name) {
  if (name && !players.includes(name)) {
    players.push(name)
  }
}

function addEvent(type, description, involvedPlayer) {
  events.push({
    type,
    description,
    player: involvedPlayer || null,
    timestamp: Date.now()
  })
}

function getRecentMessages(n = 30) {
  return messages.slice(-n)
}

function getAllMessages() {
  return messages
}

function getEvents() {
  return events
}

function getPlayers() {
  return players
}

function resetMemory() {
  messages = []
  players = []
  events = []
}

module.exports = {
  addMessage,
  addPlayer,
  addEvent,
  getRecentMessages,
  getAllMessages,
  getEvents,
  getPlayers,
  resetMemory
}

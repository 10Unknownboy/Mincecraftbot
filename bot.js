const mineflayer = require('mineflayer')

const bot = mineflayer.createBot({
  host: 'goondust.play.hosting',
  username: 'Epstein',
  version: '1.21.11'
})

bot.on('spawn', () => {
  console.log('Epstein Entered The Island <3')
})

bot.on('chat', (username, message) => {
  if (username === bot.username) return

  if (message === 'Goon') {
    bot.chat('AHHHHHHHHHHHHHHHHHHHHHHHH')
  }
})

bot.once('spawn', () => {
  setInterval(() => {
    bot.chat('/tp Epstein @r')
  }, 600000) // every 60 seconds
})
bot.on('error', console.log)
bot.on('kicked', console.log)
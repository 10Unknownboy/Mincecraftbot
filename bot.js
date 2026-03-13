const mineflayer = require('mineflayer')

function createBot() {

  const bot = mineflayer.createBot({
    host: 'goondust.play.hosting',
    username: 'Epstein',
    version: '1.21.11' // use the exact server version
  })

  bot.on('spawn', () => {
    console.log('Epstein Entered The Island <3')

    bot.chat('Hello Kids, missed me? <3')

    // run command every 10 minutes
    setInterval(() => {
      bot.chat('/tp Epstein @r')
    }, 600000)
  })

  bot.on('chat', (username, message) => {
    if (username === bot.username) return

    if (message === 'Goon') {
      bot.chat('AHHHHHHHHHHHHHHHHHHHHHHHH')
    }
  })

  bot.on('kicked', console.log)
  bot.on('error', console.log)

  // auto reconnect
  bot.on('end', () => {
    console.log('Bot disconnected... reconnecting in 5 seconds')
    setTimeout(createBot, 5000)
  })
}

createBot()
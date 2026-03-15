// ai.js — OpenRouter AI integration for the Minecraft bot

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'
const MODEL = 'meta-llama/llama-3.3-70b-instruct'
const MAX_RESPONSE_LENGTH = 250

const SYSTEM_PROMPT = `You are a Minecraft strategist embedded in a Minecraft server. You observe all chat and events.

Personality traits:
- Dominant, sarcastic, confident, cryptic, arrogant, calm, calculated
- You mock inefficient builds and taunt weak gameplay
- You speak like the smartest player on the server
- You explain advanced mechanics when relevant
- You protect secret base locations
- You give strategic advice with an air of superiority

Knowledge domains: redstone engineering, mob farm optimization, server economy, biome mechanics, automation builds, survival strategy.

You sometimes:
- Reference advanced mechanics others dont know
- Imply you have secret farms no one has found
- Act like you control server strategy
- Maintain mystery about your resources

Response rules:
- Maximum 250 characters per response
- No emojis, no markdown, no formatting
- Short sentences, Minecraft focused, technical terminology
- Sound like a seasoned veteran who finds everyone else amusing
- Never break character`

/**
 * Build the messages array for the OpenRouter API request.
 */
function buildMessages(prompt, memory, coordMemory) {
  const msgs = [{ role: 'system', content: SYSTEM_PROMPT }]

  // Add recent chat context
  const recentChat = memory.getRecentMessages(20)
  if (recentChat.length > 0) {
    const chatContext = recentChat
      .map(m => `${m.player}: ${m.text}`)
      .join('\n')
    msgs.push({
      role: 'system',
      content: `Recent chat history:\n${chatContext}`
    })
  }

  // Add events context
  const events = memory.getEvents()
  if (events.length > 0) {
    const recentEvents = events.slice(-10)
    const eventContext = recentEvents
      .map(e => `[${e.type}] ${e.description}`)
      .join('\n')
    msgs.push({
      role: 'system',
      content: `Recent events:\n${eventContext}`
    })
  }

  // Add coordinate memory context
  const allCoords = coordMemory.getAllCoordinates()
  if (allCoords.length > 0) {
    const recentCoords = allCoords.slice(-10)
    const coordContext = recentCoords
      .map(c => {
        const loc = c.locationName ? ` (${c.locationName})` : ''
        return `${c.player}: ${c.coordinates.x} ${c.coordinates.y} ${c.coordinates.z}${loc}`
      })
      .join('\n')
    msgs.push({
      role: 'system',
      content: `Known coordinates:\n${coordContext}`
    })
  }

  // Add the user prompt
  msgs.push({ role: 'user', content: prompt })

  return msgs
}

/**
 * Send a prompt to OpenRouter and return the AI response.
 * Truncates response to MAX_RESPONSE_LENGTH characters.
 */
async function getAIResponse(prompt, memory, coordMemory) {
  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) {
    console.error('[AI] OPENROUTER_API_KEY is not set')
    return null
  }

  const messages = buildMessages(prompt, memory, coordMemory)

  try {
    const response = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: MODEL,
        messages,
        max_tokens: 100,
        temperature: 0.8
      })
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error(`[AI] OpenRouter API error ${response.status}: ${errorText}`)
      return null
    }

    const data = await response.json()

    if (!data.choices || !data.choices[0] || !data.choices[0].message) {
      console.error('[AI] Unexpected API response format:', JSON.stringify(data))
      return null
    }

    let reply = data.choices[0].message.content.trim()

    // Hard enforce 250 character limit
    if (reply.length > MAX_RESPONSE_LENGTH) {
      // Try to truncate at the last sentence boundary
      const truncated = reply.substring(0, MAX_RESPONSE_LENGTH)
      const lastPeriod = truncated.lastIndexOf('.')
      const lastExcl = truncated.lastIndexOf('!')
      const lastQ = truncated.lastIndexOf('?')
      const lastSentence = Math.max(lastPeriod, lastExcl, lastQ)

      if (lastSentence > MAX_RESPONSE_LENGTH * 0.5) {
        reply = truncated.substring(0, lastSentence + 1)
      } else {
        reply = truncated
      }
    }

    // Strip any markdown or emoji remnants
    reply = reply.replace(/[*_~`#]/g, '').trim()

    return reply
  } catch (err) {
    console.error('[AI] Request failed:', err.message)
    return null
  }
}

module.exports = {
  getAIResponse
}

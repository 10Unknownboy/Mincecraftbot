// coordinateMemory.js — Detect, store, and retrieve coordinates from chat

let coordinates = []

// Regex patterns for coordinate detection
// Matches: 123 64 -456  or  -345 70 222  (3 consecutive numbers with spaces)
const PATTERN_SPACE = /(-?\d+)\s+(-?\d+)\s+(-?\d+)/
// Matches: x:123 y:64 z:-456  or  x: 123 y: 64 z: -456
const PATTERN_XYZ = /x:\s*(-?\d+)\s+y:\s*(-?\d+)\s+z:\s*(-?\d+)/i

/**
 * Try to detect coordinates in a chat message and store them.
 * Returns the stored entry if coordinates were found, null otherwise.
 */
function detectAndStore(player, message) {
  let match = message.match(PATTERN_XYZ) || message.match(PATTERN_SPACE)
  if (!match) return null

  const x = parseInt(match[1], 10)
  const y = parseInt(match[2], 10)
  const z = parseInt(match[3], 10)

  // Try to extract a location name from the message
  // Looks for patterns like "base at", "farm at", "mine at", "house at", etc.
  const locationName = extractLocationName(message)

  const entry = {
    player,
    coordinates: { x, y, z },
    locationName,
    timestamp: Date.now()
  }

  coordinates.push(entry)
  return entry
}

/**
 * Extract a location name from a message containing coordinates.
 * Looks for common patterns like "base at ...", "my farm at ..."
 */
function extractLocationName(message) {
  // Try to find a word before "at" or "is at" patterns
  const atMatch = message.match(/(\w[\w\s]{0,20}?)\s+(?:is\s+)?at\s+/i)
  if (atMatch) {
    return atMatch[1].trim()
  }

  // Try to find a word before the coordinates
  const beforeCoords = message.match(/(\w+)\s+(?:-?\d+\s+-?\d+\s+-?\d+|x:\s*-?\d+)/i)
  if (beforeCoords) {
    const word = beforeCoords[1].toLowerCase()
    const locationWords = ['base', 'farm', 'house', 'mine', 'portal', 'spawn', 'shop', 'storage', 'grinder', 'tower', 'bridge', 'village', 'outpost', 'bunker', 'castle']
    if (locationWords.includes(word)) {
      return word
    }
  }

  return null
}

/**
 * Search stored coordinates by query string.
 * Matches against player name, location name, or coordinate values.
 */
function searchCoordinates(query) {
  if (!query || query.trim() === '') return coordinates

  const q = query.toLowerCase().trim()

  return coordinates.filter(entry => {
    if (entry.player && entry.player.toLowerCase().includes(q)) return true
    if (entry.locationName && entry.locationName.toLowerCase().includes(q)) return true
    const coordStr = `${entry.coordinates.x} ${entry.coordinates.y} ${entry.coordinates.z}`
    if (coordStr.includes(q)) return true
    return false
  })
}

function getAllCoordinates() {
  return coordinates
}

function resetCoordinates() {
  coordinates = []
}

module.exports = {
  detectAndStore,
  searchCoordinates,
  getAllCoordinates,
  resetCoordinates
}

const HOST_TOKEN_KEY = "hroof:host:token"
const HOST_ROOM_ID_KEY = "hroof:host:roomId"
const HOST_USERNAME_KEY = "hroof:host:username"
const PLAYER_PREFIX = "hroof:player:session:"

export type PlayerSession = {
  roomId: string
  playerId: string
  playerName: string
  token: string
}

function canUseStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined"
}

function getString(key: string) {
  if (!canUseStorage()) {
    return null
  }

  return window.localStorage.getItem(key)
}

function setString(key: string, value: string) {
  if (!canUseStorage()) {
    return
  }

  window.localStorage.setItem(key, value)
}

function removeString(key: string) {
  if (!canUseStorage()) {
    return
  }

  window.localStorage.removeItem(key)
}

export function getHostToken() {
  return getString(HOST_TOKEN_KEY)
}

export function setHostToken(token: string) {
  setString(HOST_TOKEN_KEY, token)
}

export function clearHostToken() {
  removeString(HOST_TOKEN_KEY)
}

export function getHostRoomId() {
  return getString(HOST_ROOM_ID_KEY)
}

export function setHostRoomId(roomId: string) {
  setString(HOST_ROOM_ID_KEY, roomId)
}

export function clearHostRoomId() {
  removeString(HOST_ROOM_ID_KEY)
}

export function getHostUsername() {
  return getString(HOST_USERNAME_KEY)
}

export function setHostUsername(username: string) {
  setString(HOST_USERNAME_KEY, username)
}

export function clearHostSession() {
  clearHostToken()
  clearHostRoomId()
  removeString(HOST_USERNAME_KEY)
}

function playerKey(roomId: string) {
  return `${PLAYER_PREFIX}${roomId}`
}

export function savePlayerSession(session: PlayerSession) {
  setString(playerKey(session.roomId), JSON.stringify(session))
}

export function getPlayerSession(roomId: string): PlayerSession | null {
  const raw = getString(playerKey(roomId))
  if (!raw) {
    return null
  }

  try {
    const parsed = JSON.parse(raw) as PlayerSession
    if (!parsed.roomId || !parsed.playerId || !parsed.playerName || !parsed.token) {
      return null
    }

    return parsed
  } catch {
    return null
  }
}

export function clearPlayerSession(roomId: string) {
  removeString(playerKey(roomId))
}

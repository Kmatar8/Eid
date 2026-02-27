import { randomUUID } from "crypto"

import { hashPassword, verifyPassword } from "@/lib/server/password"
import type { ClientActionType, ClientRole } from "@/lib/server/protocol-v1"
import { TRIVIA_QUESTION_BANK } from "@/lib/server/trivia-bank"
import type {
  AvatarType,
  HostRecord,
  PlayerRecord,
  RoomEventRecord,
  RoomRecord,
  RoomSnapshot,
  RoomState,
  TeamRecord,
  TriviaOption,
  TriviaPhase,
  TriviaQuestion,
  TriviaSnapshot,
} from "@/lib/server/types"

const LOBBY_OPEN_TIMEOUT_MS = 45 * 60 * 1000
const HOST_PAUSE_GRACE_MS = 20 * 60 * 1000
const HARD_ROOM_CAP_MS = 4 * 60 * 60 * 1000

type InMemoryStore = {
  seeded: boolean
  hosts: Map<string, HostRecord>
  hostsByUsername: Map<string, string>
  rooms: Map<string, RoomRecord>
  players: Map<string, PlayerRecord>
  playersByRoom: Map<string, Set<string>>
  teamsByRoom: Map<string, TeamRecord[]>
  playerTeamsByRoom: Map<string, Map<string, string>>
  triviaByRoom: Map<string, TriviaSession>
  processedHostCommandsByRoom: Map<string, Set<string>>
  processedPlayerSubmitByRoom: Map<string, Map<string, RoomEventRecord>>
  roomEvents: RoomEventRecord[]
}

type HostSeedInput = {
  username: string
  passwordHash?: string
  password?: string
}

type TriviaSession = {
  status: "in_progress" | "completed"
  phase: TriviaPhase
  questionIndex: number
  questions: TriviaQuestion[]
  currentTeamId: string | null
  currentResponderPlayerId: string | null
  lastResult: TriviaSnapshot["lastResult"]
  turnsByTeam: Record<string, number>
  answersByPlayer: Map<string, number>
  rngSeed: number
}

type GlobalWithStore = typeof globalThis & {
  __hroofInMemoryStore?: InMemoryStore
}

const ACTIVE_ROOM_STATES: Set<RoomState> = new Set([
  "lobby_open",
  "lobby_locked",
  "teams_ready",
  "game_live",
  "between_games",
  "paused_wait_host",
])

function nowMs() {
  return Date.now()
}

function getStore(): InMemoryStore {
  const globalStore = globalThis as GlobalWithStore
  if (!globalStore.__hroofInMemoryStore) {
    globalStore.__hroofInMemoryStore = {
      seeded: false,
      hosts: new Map(),
      hostsByUsername: new Map(),
      rooms: new Map(),
      players: new Map(),
      playersByRoom: new Map(),
      teamsByRoom: new Map(),
      playerTeamsByRoom: new Map(),
      triviaByRoom: new Map(),
      processedHostCommandsByRoom: new Map(),
      processedPlayerSubmitByRoom: new Map(),
      roomEvents: [],
    }
  }

  const store = globalStore.__hroofInMemoryStore
  if (!store.seeded) {
    seedHosts(store)
    store.seeded = true
  }

  return store
}

type EncodedMap = {
  __kind: "Map"
  entries: unknown[]
}

type EncodedSet = {
  __kind: "Set"
  values: unknown[]
}

function encodeStoreValue(_key: string, value: unknown) {
  if (value instanceof Map) {
    return {
      __kind: "Map",
      entries: Array.from(value.entries()),
    } satisfies EncodedMap
  }

  if (value instanceof Set) {
    return {
      __kind: "Set",
      values: Array.from(value.values()),
    } satisfies EncodedSet
  }

  return value
}

function decodeStoreValue(_key: string, value: unknown) {
  if (!value || typeof value !== "object") {
    return value
  }

  const candidate = value as (Partial<EncodedMap> & Partial<EncodedSet> & { __kind?: string })
  if (candidate.__kind === "Map" && Array.isArray(candidate.entries)) {
    return new Map(candidate.entries as [string, unknown][])
  }

  if (candidate.__kind === "Set" && Array.isArray(candidate.values)) {
    return new Set(candidate.values)
  }

  return value
}

function isStoreLike(value: unknown): value is InMemoryStore {
  if (!value || typeof value !== "object") {
    return false
  }

  const candidate = value as Partial<InMemoryStore>
  return (
    typeof candidate.seeded === "boolean" &&
    candidate.hosts instanceof Map &&
    candidate.hostsByUsername instanceof Map &&
    candidate.rooms instanceof Map &&
    candidate.players instanceof Map &&
    candidate.playersByRoom instanceof Map &&
    candidate.teamsByRoom instanceof Map &&
    candidate.playerTeamsByRoom instanceof Map &&
    candidate.triviaByRoom instanceof Map &&
    candidate.processedHostCommandsByRoom instanceof Map &&
    candidate.processedPlayerSubmitByRoom instanceof Map &&
    Array.isArray(candidate.roomEvents)
  )
}

export function exportStoreSnapshot(): unknown {
  const store = getStore()
  return JSON.parse(JSON.stringify(store, encodeStoreValue))
}

export function importStoreSnapshot(snapshot: unknown): boolean {
  if (!snapshot || typeof snapshot !== "object") {
    return false
  }

  try {
    const restored = JSON.parse(JSON.stringify(snapshot), decodeStoreValue) as unknown
    if (restored && typeof restored === "object") {
      const candidate = restored as Partial<InMemoryStore> & Record<string, unknown>
      if (!(candidate.processedPlayerSubmitByRoom instanceof Map)) {
        candidate.processedPlayerSubmitByRoom = new Map()
      }
    }

    if (!isStoreLike(restored)) {
      return false
    }

    const globalStore = globalThis as GlobalWithStore
    globalStore.__hroofInMemoryStore = restored
    return true
  } catch {
    return false
  }
}

function parseHostSeedInputs(): HostSeedInput[] {
  const raw = process.env.HROOF_HOST_CREDENTIALS_JSON
  if (!raw) {
    return [{ username: "host-demo", password: "demo1234" }]
  }

  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) {
      return [{ username: "host-demo", password: "demo1234" }]
    }

    const safeInputs: HostSeedInput[] = []
    for (const item of parsed) {
      if (!item || typeof item !== "object") {
        continue
      }

      const candidate = item as Record<string, unknown>
      const username = typeof candidate.username === "string" ? candidate.username.trim() : ""
      const passwordHash = typeof candidate.passwordHash === "string" ? candidate.passwordHash : undefined
      const password = typeof candidate.password === "string" ? candidate.password : undefined

      if (!username || (!passwordHash && !password)) {
        continue
      }

      safeInputs.push({ username, passwordHash, password })
    }

    if (safeInputs.length === 0) {
      return [{ username: "host-demo", password: "demo1234" }]
    }

    return safeInputs
  } catch {
    return [{ username: "host-demo", password: "demo1234" }]
  }
}

function seedHosts(store: InMemoryStore) {
  const seeds = parseHostSeedInputs()

  for (const seed of seeds) {
    const id = `host_${randomUUID()}`
    const host: HostRecord = {
      id,
      username: seed.username,
      passwordHash: seed.passwordHash ?? hashPassword(seed.password ?? "change-me"),
      activeRoomId: null,
      createdAt: nowMs(),
    }

    store.hosts.set(host.id, host)
    store.hostsByUsername.set(host.username, host.id)
  }
}

function recordRoomEvent(
  store: InMemoryStore,
  roomId: string,
  eventType: string,
  payload: Record<string, unknown>,
  options?: { bumpVersion?: boolean }
) {
  const room = store.rooms.get(roomId)
  const shouldBump = options?.bumpVersion ?? true
  const createdAt = nowMs()

  if (room && shouldBump) {
    room.version += 1
    room.updatedAt = createdAt
  }

  store.roomEvents.push({
    id: `evt_${randomUUID()}`,
    seq: store.roomEvents.length + 1,
    roomId,
    roomVersion: room?.version ?? 0,
    eventType,
    payload,
    createdAt,
  })
}

function isPastLobbyTimeout(room: RoomRecord) {
  return room.state === "lobby_open" && nowMs() > room.expiresAt
}

function isPastPauseGrace(room: RoomRecord) {
  if (room.state !== "paused_wait_host" || !room.pausedAt) {
    return false
  }

  return nowMs() > room.pausedAt + HOST_PAUSE_GRACE_MS
}

function isPastHardCap(room: RoomRecord) {
  return ACTIVE_ROOM_STATES.has(room.state) && nowMs() > room.createdAt + HARD_ROOM_CAP_MS
}

function expireRoom(store: InMemoryStore, room: RoomRecord, reason: string) {
  if (room.state === "expired" || room.state === "session_completed") {
    return
  }

  room.state = "expired"
  room.updatedAt = nowMs()
  room.completedAt = room.updatedAt

  const host = store.hosts.get(room.hostId)
  if (host?.activeRoomId === room.id) {
    host.activeRoomId = null
  }

  recordRoomEvent(store, room.id, "room.expired", { reason })
}

function applyTimeouts(store: InMemoryStore, room: RoomRecord) {
  if (isPastLobbyTimeout(room)) {
    expireRoom(store, room, "lobby_timeout")
    return
  }

  if (isPastPauseGrace(room)) {
    expireRoom(store, room, "paused_timeout")
    return
  }

  if (isPastHardCap(room)) {
    expireRoom(store, room, "hard_cap")
  }
}

function sanitizeAvatar(avatarImageUrl?: string, avatarEmoji?: string): { type: AvatarType; value: string | null } {
  if (avatarImageUrl && avatarImageUrl.trim()) {
    return { type: "image", value: avatarImageUrl.trim() }
  }

  if (avatarEmoji && avatarEmoji.trim()) {
    return { type: "emoji", value: avatarEmoji.trim() }
  }

  return { type: "none", value: null }
}

function hashSeed(input: string) {
  let hash = 2166136261
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }

  return hash >>> 0
}

function nextSeed(seed: number) {
  return (Math.imul(seed, 1664525) + 1013904223) >>> 0
}

function deterministicShuffle(values: string[], seedInput: string): string[] {
  const shuffled = [...values]
  let seed = hashSeed(seedInput)

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    seed = nextSeed(seed)
    const swapIndex = seed % (index + 1)
    const current = shuffled[index]
    shuffled[index] = shuffled[swapIndex] as string
    shuffled[swapIndex] = current as string
  }

  return shuffled
}

function ensureTeamsSeeded(store: InMemoryStore, roomId: string) {
  if (store.teamsByRoom.has(roomId) && store.playerTeamsByRoom.has(roomId)) {
    return
  }

  const timestamp = nowMs()
  const teams: TeamRecord[] = [
    {
      id: "team_a",
      roomId,
      name: "Team A",
      order: 0,
      score: 0,
      createdAt: timestamp,
    },
    {
      id: "team_b",
      roomId,
      name: "Team B",
      order: 1,
      score: 0,
      createdAt: timestamp,
    },
  ]

  store.teamsByRoom.set(roomId, teams)
  store.playerTeamsByRoom.set(roomId, new Map())
}

function assignPlayerToTeam(
  store: InMemoryStore,
  roomId: string,
  playerId: string,
  teamId: string
): { ok: true } | { ok: false; code: "PLAYER_NOT_FOUND" | "TEAM_NOT_FOUND" } {
  ensureTeamsSeeded(store, roomId)

  const playerInRoom = Array.from(store.playersByRoom.get(roomId) ?? []).includes(playerId)
  if (!playerInRoom) {
    return { ok: false, code: "PLAYER_NOT_FOUND" }
  }

  const team = store.teamsByRoom.get(roomId)?.find((entry) => entry.id === teamId)
  if (!team) {
    return { ok: false, code: "TEAM_NOT_FOUND" }
  }

  const mapping = store.playerTeamsByRoom.get(roomId) ?? new Map<string, string>()
  mapping.set(playerId, team.id)
  store.playerTeamsByRoom.set(roomId, mapping)

  return { ok: true }
}

function assignBalancedTeams(store: InMemoryStore, roomId: string, preserveExisting = false) {
  ensureTeamsSeeded(store, roomId)
  const teams = store.teamsByRoom.get(roomId) ?? []
  const playerTeamMap = store.playerTeamsByRoom.get(roomId) ?? new Map<string, string>()

  const playerIds = Array.from(store.playersByRoom.get(roomId) ?? [])
    .map((playerId) => store.players.get(playerId))
    .filter((player): player is PlayerRecord => Boolean(player))
    .sort((a, b) => a.joinedAt - b.joinedAt)
    .map((player) => player.id)

  if (!preserveExisting) {
    playerTeamMap.clear()
  } else {
    for (const [playerId, mappedTeamId] of Array.from(playerTeamMap.entries())) {
      const playerStillExists = playerIds.includes(playerId)
      const teamStillExists = teams.some((team) => team.id === mappedTeamId)
      if (!playerStillExists || !teamStillExists) {
        playerTeamMap.delete(playerId)
      }
    }
  }

  const teamA = teams.find((team) => team.id === "team_a")
  const teamB = teams.find((team) => team.id === "team_b")

  const unassignedPlayers = playerIds.filter((playerId) => !playerTeamMap.has(playerId))
  const shuffled = deterministicShuffle(unassignedPlayers, `${roomId}:team-balance`)

  let teamACount = Array.from(playerTeamMap.values()).filter((teamId) => teamId === "team_a").length
  let teamBCount = Array.from(playerTeamMap.values()).filter((teamId) => teamId === "team_b").length

  for (let index = 0; index < shuffled.length; index += 1) {
    const playerId = shuffled[index]
    const targetTeamId = teamACount <= teamBCount ? "team_a" : "team_b"
    if (playerId) {
      playerTeamMap.set(playerId, targetTeamId)
      if (targetTeamId === "team_a") {
        teamACount += 1
      } else {
        teamBCount += 1
      }
    }
  }

  store.playerTeamsByRoom.set(roomId, playerTeamMap)

  return {
    teamAPlayers: Array.from(playerTeamMap.values()).filter((teamId) => teamId === "team_a").length,
    teamBPlayers: Array.from(playerTeamMap.values()).filter((teamId) => teamId === "team_b").length,
    teamsSeeded: Boolean(teamA && teamB),
  }
}

function addTeamScore(
  store: InMemoryStore,
  roomId: string,
  teamId: string,
  delta: number
): { ok: true; nextScore: number } | { ok: false; code: "TEAM_NOT_FOUND" | "INVALID_DELTA" } {
  if (!Number.isFinite(delta) || delta === 0) {
    return { ok: false, code: "INVALID_DELTA" }
  }

  ensureTeamsSeeded(store, roomId)
  const team = store.teamsByRoom.get(roomId)?.find((entry) => entry.id === teamId)
  if (!team) {
    return { ok: false, code: "TEAM_NOT_FOUND" }
  }

  team.score += delta
  return { ok: true, nextScore: team.score }
}

function nextTriviaRandom(session: TriviaSession) {
  session.rngSeed = nextSeed(session.rngSeed)
  return session.rngSeed
}

function pickRandom<T>(values: T[], session: TriviaSession): T | null {
  if (values.length === 0) {
    return null
  }

  const index = nextTriviaRandom(session) % values.length
  return values[index] ?? null
}

function getTeamPlayerIds(store: InMemoryStore, roomId: string, teamId: string): string[] {
  const mapping = store.playerTeamsByRoom.get(roomId) ?? new Map<string, string>()
  return Array.from(mapping.entries())
    .filter(([, mappedTeamId]) => mappedTeamId === teamId)
    .map(([playerId]) => playerId)
}

function selectTeamForQuestion(store: InMemoryStore, roomId: string, session: TriviaSession): string | null {
  const teams = store.teamsByRoom.get(roomId) ?? []
  const eligibleTeamIds = teams
    .map((team) => team.id)
    .filter((teamId) => getTeamPlayerIds(store, roomId, teamId).length > 0)

  if (eligibleTeamIds.length === 0) {
    return null
  }

  const turnCounts = eligibleTeamIds.map((teamId) => ({
    teamId,
    turns: session.turnsByTeam[teamId] ?? 0,
  }))
  const minTurns = Math.min(...turnCounts.map((entry) => entry.turns))
  const leastUsedTeams = turnCounts.filter((entry) => entry.turns === minTurns).map((entry) => entry.teamId)
  const chosen = pickRandom(leastUsedTeams, session)
  if (!chosen) {
    return null
  }

  session.turnsByTeam[chosen] = (session.turnsByTeam[chosen] ?? 0) + 1
  return chosen
}

function selectResponderForTeam(
  store: InMemoryStore,
  roomId: string,
  teamId: string,
  session: TriviaSession
): string | null {
  const teamPlayerIds = getTeamPlayerIds(store, roomId, teamId)
  if (teamPlayerIds.length === 0) {
    return null
  }

  const usage = teamPlayerIds.map((playerId) => ({
    playerId,
    answered: session.answersByPlayer.get(playerId) ?? 0,
  }))
  const minAnswered = Math.min(...usage.map((entry) => entry.answered))
  const candidates = usage.filter((entry) => entry.answered === minAnswered).map((entry) => entry.playerId)
  return pickRandom(candidates, session)
}

function currentTriviaQuestion(session: TriviaSession): TriviaQuestion | null {
  if (session.questionIndex < 0 || session.questionIndex >= session.questions.length) {
    return null
  }

  return session.questions[session.questionIndex] ?? null
}

function toTriviaSnapshot(session: TriviaSession | null): TriviaSnapshot {
  if (!session) {
    return {
      status: "idle",
      phase: null,
      questionIndex: -1,
      totalQuestions: 0,
      currentTeamId: null,
      currentResponderPlayerId: null,
      currentQuestion: null,
      lastResult: null,
    }
  }

  const question = currentTriviaQuestion(session)
  return {
    status: session.status,
    phase: session.phase,
    questionIndex: session.questionIndex,
    totalQuestions: session.questions.length,
    currentTeamId: session.currentTeamId,
    currentResponderPlayerId: session.currentResponderPlayerId,
    currentQuestion: question
      ? {
          id: question.id,
          prompt: question.prompt,
          options: question.options,
        }
      : null,
    lastResult: session.lastResult,
  }
}

function setNextTriviaQuestion(store: InMemoryStore, roomId: string, session: TriviaSession): boolean {
  const nextIndex = session.questionIndex + 1
  if (nextIndex >= session.questions.length) {
    session.status = "completed"
    session.phase = "next_question_or_end"
    session.currentTeamId = null
    session.currentResponderPlayerId = null
    return false
  }

  session.questionIndex = nextIndex
  session.lastResult = null
  const teamId = selectTeamForQuestion(store, roomId, session)
  if (!teamId) {
    session.status = "completed"
    session.phase = "next_question_or_end"
    session.currentTeamId = null
    session.currentResponderPlayerId = null
    return false
  }

  const responder = selectResponderForTeam(store, roomId, teamId, session)
  if (!responder) {
    session.status = "completed"
    session.phase = "next_question_or_end"
    session.currentTeamId = null
    session.currentResponderPlayerId = null
    return false
  }

  session.currentTeamId = teamId
  session.currentResponderPlayerId = responder
  session.phase = "question_active_primary_team"
  return true
}

function parseTriviaOption(value: unknown): TriviaOption | null {
  if (value === "A" || value === "B" || value === "C" || value === "D") {
    return value
  }

  return null
}

function getOppositeTeamId(store: InMemoryStore, roomId: string, teamId: string): string | null {
  const teams = store.teamsByRoom.get(roomId) ?? []
  const opposite = teams.find((team) => team.id !== teamId)
  return opposite?.id ?? null
}

export function isRoomActiveState(state: RoomState) {
  return ACTIVE_ROOM_STATES.has(state)
}

export function isRoomJoinableState(state: RoomState) {
  return state === "lobby_open"
}

export function authenticateHost(username: string, password: string): HostRecord | null {
  const store = getStore()
  const hostId = store.hostsByUsername.get(username)
  if (!hostId) {
    return null
  }

  const host = store.hosts.get(hostId)
  if (!host) {
    return null
  }

  return verifyPassword(password, host.passwordHash) ? host : null
}

export function getRoom(roomId: string): RoomRecord | null {
  const store = getStore()
  const room = store.rooms.get(roomId)
  if (!room) {
    return null
  }

  applyTimeouts(store, room)
  return room
}

export function createRoomForHost(hostId: string):
  | { ok: true; room: RoomRecord }
  | { ok: false; code: "HOST_NOT_FOUND" | "HOST_ALREADY_ACTIVE"; activeRoomId?: string } {
  const store = getStore()
  const host = store.hosts.get(hostId)

  if (!host) {
    return { ok: false, code: "HOST_NOT_FOUND" }
  }

  if (host.activeRoomId) {
    const activeRoom = store.rooms.get(host.activeRoomId)
    if (activeRoom) {
      applyTimeouts(store, activeRoom)
      if (isRoomActiveState(activeRoom.state)) {
        return { ok: false, code: "HOST_ALREADY_ACTIVE", activeRoomId: activeRoom.id }
      }
    }

    host.activeRoomId = null
  }

  const timestamp = nowMs()
  const room: RoomRecord = {
    id: `room_${randomUUID()}`,
    hostId,
    state: "lobby_open",
    version: 0,
    createdAt: timestamp,
    updatedAt: timestamp,
    expiresAt: timestamp + LOBBY_OPEN_TIMEOUT_MS,
    pausedAt: null,
    completedAt: null,
    supersededBy: null,
  }

  store.rooms.set(room.id, room)
  ensureTeamsSeeded(store, room.id)
  store.processedHostCommandsByRoom.set(room.id, new Set())
  store.processedPlayerSubmitByRoom.set(room.id, new Map())
  host.activeRoomId = room.id
  recordRoomEvent(store, room.id, "room.created", { hostId })

  return { ok: true, room }
}

export function createPlayerForRoom(
  roomId: string,
  input: { displayName: string; avatarImageUrl?: string; avatarEmoji?: string }
):
  | { ok: true; player: PlayerRecord }
  | { ok: false; code: "ROOM_NOT_FOUND" | "ROOM_NOT_JOINABLE" } {
  const store = getStore()
  const room = getRoom(roomId)

  if (!room) {
    return { ok: false, code: "ROOM_NOT_FOUND" }
  }

  if (!isRoomJoinableState(room.state)) {
    return { ok: false, code: "ROOM_NOT_JOINABLE" }
  }

  const avatar = sanitizeAvatar(input.avatarImageUrl, input.avatarEmoji)
  const timestamp = nowMs()
  const player: PlayerRecord = {
    id: `player_${randomUUID()}`,
    roomId,
    displayName: input.displayName,
    avatarType: avatar.type,
    avatarValue: avatar.value,
    joinedAt: timestamp,
    lastSeenAt: timestamp,
  }

  store.players.set(player.id, player)

  if (!store.playersByRoom.has(roomId)) {
    store.playersByRoom.set(roomId, new Set())
  }
  store.playersByRoom.get(roomId)?.add(player.id)

  room.updatedAt = timestamp
  recordRoomEvent(store, roomId, "player.joined", {
    playerId: player.id,
    displayName: player.displayName,
  })

  return { ok: true, player }
}

export function completeRoomForHost(
  hostId: string,
  roomId: string
):
  | { ok: true; room: RoomRecord }
  | { ok: false; code: "HOST_NOT_FOUND" | "ROOM_NOT_FOUND" | "ROOM_HOST_MISMATCH" } {
  const store = getStore()
  const host = store.hosts.get(hostId)
  if (!host) {
    return { ok: false, code: "HOST_NOT_FOUND" }
  }

  const room = getRoom(roomId)
  if (!room) {
    return { ok: false, code: "ROOM_NOT_FOUND" }
  }

  if (room.hostId !== hostId) {
    return { ok: false, code: "ROOM_HOST_MISMATCH" }
  }

  if (room.state !== "session_completed") {
    const timestamp = nowMs()
    room.state = "session_completed"
    room.updatedAt = timestamp
    room.completedAt = timestamp
    recordRoomEvent(store, room.id, "room.completed", { hostId })
  }

  if (host.activeRoomId === room.id) {
    host.activeRoomId = null
  }

  store.triviaByRoom.delete(room.id)
  store.processedHostCommandsByRoom.delete(room.id)
  store.processedPlayerSubmitByRoom.delete(room.id)

  return { ok: true, room }
}

export function getRoomEventsSince(roomId: string, sinceVersion = 0, limit = 100): RoomEventRecord[] {
  const store = getStore()
  const room = getRoom(roomId)
  if (!room) {
    return []
  }

  return store.roomEvents
    .filter((event) => event.roomId === roomId && event.roomVersion > sinceVersion)
    .sort((a, b) => a.seq - b.seq)
    .slice(0, Math.max(1, limit))
}

type ApplyRoomActionInput = {
  roomId: string
  actorRole: ClientRole
  actorId: string
  actionType: ClientActionType
  requestId?: string
  payload?: Record<string, unknown>
}

type ApplyRoomActionResult =
  | { ok: true; room: RoomRecord; event: RoomEventRecord }
  | {
      ok: false
      code:
        | "ROOM_NOT_FOUND"
        | "HOST_ROOM_MISMATCH"
        | "PLAYER_NOT_FOUND"
        | "INVALID_STATE_TRANSITION"
        | "INVALID_TEAM_ASSIGNMENT"
        | "TEAM_NOT_FOUND"
        | "INVALID_DELTA"
        | "TRIVIA_NOT_ACTIVE"
        | "TRIVIA_INVALID_RESPONDER"
        | "INVALID_OPTION"
        | "ACTION_NOT_SUPPORTED"
      state?: RoomState
    }

function getLatestRoomEvent(store: InMemoryStore, roomId: string): RoomEventRecord | null {
  for (let index = store.roomEvents.length - 1; index >= 0; index -= 1) {
    const event = store.roomEvents[index]
    if (event && event.roomId === roomId) {
      return event
    }
  }
  return null
}

export function applyRoomAction(input: ApplyRoomActionInput): ApplyRoomActionResult {
  const store = getStore()
  const room = getRoom(input.roomId)
  if (!room) {
    return { ok: false, code: "ROOM_NOT_FOUND" }
  }

  if (input.actorRole === "host") {
    if (room.hostId !== input.actorId) {
      return { ok: false, code: "HOST_ROOM_MISMATCH" }
    }

    if (input.requestId) {
      const processed = store.processedHostCommandsByRoom.get(room.id) ?? new Set<string>()
      store.processedHostCommandsByRoom.set(room.id, processed)
      if (processed.has(input.requestId)) {
        const latestEvent = getLatestRoomEvent(store, room.id)
        if (!latestEvent) {
          return { ok: false, code: "ACTION_NOT_SUPPORTED" }
        }
        return { ok: true, room, event: latestEvent }
      }
    }

    if (input.actionType === "host.endSession") {
      const completed = completeRoomForHost(input.actorId, input.roomId)
      if (!completed.ok) {
        return { ok: false, code: completed.code === "ROOM_NOT_FOUND" ? "ROOM_NOT_FOUND" : "HOST_ROOM_MISMATCH" }
      }

      const event = getLatestRoomEvent(store, input.roomId)
      if (!event) {
        return { ok: false, code: "ACTION_NOT_SUPPORTED" }
      }

      if (input.requestId) {
        const processed = store.processedHostCommandsByRoom.get(room.id) ?? new Set<string>()
        processed.add(input.requestId)
        store.processedHostCommandsByRoom.set(room.id, processed)
      }

      return { ok: true, room: completed.room, event }
    }

    if (input.actionType === "host.lockLobby") {
      if (room.state !== "lobby_open") {
        return { ok: false, code: "INVALID_STATE_TRANSITION", state: room.state }
      }

      room.state = "lobby_locked"
      room.pausedAt = null
      recordRoomEvent(store, room.id, "room.lobby_locked", { hostId: input.actorId })
    } else if (input.actionType === "host.assignPlayerTeam") {
      if (room.state !== "lobby_open" && room.state !== "lobby_locked" && room.state !== "teams_ready") {
        return { ok: false, code: "INVALID_STATE_TRANSITION", state: room.state }
      }

      const playerId = typeof input.payload?.playerId === "string" ? input.payload.playerId : ""
      const teamId = typeof input.payload?.teamId === "string" ? input.payload.teamId : ""
      if (!playerId || !teamId) {
        return { ok: false, code: "INVALID_TEAM_ASSIGNMENT" }
      }

      const assigned = assignPlayerToTeam(store, room.id, playerId, teamId)
      if (!assigned.ok) {
        return { ok: false, code: assigned.code }
      }

      recordRoomEvent(store, room.id, "room.team_assignment_updated", {
        hostId: input.actorId,
        playerId,
        teamId,
      })
    } else if (input.actionType === "host.startTeams") {
      if (room.state !== "lobby_locked") {
        return { ok: false, code: "INVALID_STATE_TRANSITION", state: room.state }
      }

      const assignments = assignBalancedTeams(store, room.id, true)
      room.state = "teams_ready"
      room.pausedAt = null
      recordRoomEvent(store, room.id, "room.teams_ready", {
        hostId: input.actorId,
        teamAPlayers: assignments.teamAPlayers,
        teamBPlayers: assignments.teamBPlayers,
      })
    } else if (input.actionType === "host.startGame") {
      if (room.state !== "teams_ready" && room.state !== "between_games") {
        return { ok: false, code: "INVALID_STATE_TRANSITION", state: room.state }
      }

      room.state = "game_live"
      room.pausedAt = null
      recordRoomEvent(store, room.id, "room.game_live", { hostId: input.actorId })
    } else if (input.actionType === "host.startTrivia") {
      if (room.state !== "teams_ready" && room.state !== "between_games") {
        return { ok: false, code: "INVALID_STATE_TRANSITION", state: room.state }
      }

      const questionIds = deterministicShuffle(
        TRIVIA_QUESTION_BANK.map((question) => question.id),
        `${room.id}:questions`
      )
      const questions = questionIds
        .map((questionId) => TRIVIA_QUESTION_BANK.find((question) => question.id === questionId))
        .filter((question): question is TriviaQuestion => Boolean(question))

      if (questions.length === 0) {
        return { ok: false, code: "ACTION_NOT_SUPPORTED" }
      }

      const session: TriviaSession = {
        status: "in_progress",
        phase: "question_prepare",
        questionIndex: -1,
        questions,
        currentTeamId: null,
        currentResponderPlayerId: null,
        lastResult: null,
        turnsByTeam: {},
        answersByPlayer: new Map(),
        rngSeed: hashSeed(`${room.id}:trivia`),
      }

      store.triviaByRoom.set(room.id, session)
      room.state = "game_live"
      room.pausedAt = null

      const started = setNextTriviaQuestion(store, room.id, session)
      if (!started) {
        session.status = "completed"
        session.phase = "next_question_or_end"
        room.state = "between_games"
        recordRoomEvent(store, room.id, "trivia.completed", { reason: "no_eligible_players" })
      } else {
        const question = currentTriviaQuestion(session)
        recordRoomEvent(store, room.id, "trivia.question_started", {
          questionId: question?.id ?? null,
          questionIndex: session.questionIndex,
          teamId: session.currentTeamId,
          responderPlayerId: session.currentResponderPlayerId,
        })
      }
    } else if (input.actionType === "host.nextQuestion") {
      const session = store.triviaByRoom.get(room.id)
      if (!session || session.status !== "in_progress") {
        return { ok: false, code: "TRIVIA_NOT_ACTIVE" }
      }

      const hasNext = setNextTriviaQuestion(store, room.id, session)
      if (!hasNext) {
        session.status = "completed"
        session.phase = "next_question_or_end"
        room.state = "between_games"
        recordRoomEvent(store, room.id, "trivia.completed", { reason: "questions_exhausted" })
      } else {
        const question = currentTriviaQuestion(session)
        recordRoomEvent(store, room.id, "trivia.question_started", {
          questionId: question?.id ?? null,
          questionIndex: session.questionIndex,
          teamId: session.currentTeamId,
          responderPlayerId: session.currentResponderPlayerId,
        })
      }
    } else if (input.actionType === "host.addTeamScore") {
      if (room.state !== "game_live") {
        return { ok: false, code: "INVALID_STATE_TRANSITION", state: room.state }
      }

      const teamId = typeof input.payload?.teamId === "string" ? input.payload.teamId : ""
      const delta = typeof input.payload?.delta === "number" ? input.payload.delta : Number.NaN
      const reason = typeof input.payload?.reason === "string" ? input.payload.reason : "manual_adjustment"

      const scoreResult = addTeamScore(store, room.id, teamId, delta)
      if (!scoreResult.ok) {
        return { ok: false, code: scoreResult.code }
      }

      recordRoomEvent(store, room.id, "room.score_updated", {
        hostId: input.actorId,
        teamId,
        delta,
        nextScore: scoreResult.nextScore,
        reason,
      })
    } else {
      return { ok: false, code: "ACTION_NOT_SUPPORTED" }
    }

    const event = getLatestRoomEvent(store, input.roomId)
    if (!event) {
      return { ok: false, code: "ACTION_NOT_SUPPORTED" }
    }

    if (input.requestId) {
      const processed = store.processedHostCommandsByRoom.get(room.id) ?? new Set<string>()
      processed.add(input.requestId)
      store.processedHostCommandsByRoom.set(room.id, processed)
    }

    return { ok: true, room, event }
  }

  const player = getPlayerInRoom(input.roomId, input.actorId)
  if (!player) {
    return { ok: false, code: "PLAYER_NOT_FOUND" }
  }

  if (input.actionType === "player.heartbeat") {
    touchPlayer(input.roomId, input.actorId)
    recordRoomEvent(store, room.id, "player.heartbeat", { playerId: input.actorId })
  } else if (input.actionType === "player.input") {
    if (room.state !== "game_live") {
      return { ok: false, code: "INVALID_STATE_TRANSITION", state: room.state }
    }

    touchPlayer(input.roomId, input.actorId)
    recordRoomEvent(store, room.id, "player.input", {
      playerId: input.actorId,
      payload: input.payload ?? {},
    })
  } else if (input.actionType === "player.submitAnswer") {
    if (input.requestId) {
      const processedSubmits = store.processedPlayerSubmitByRoom.get(room.id) ?? new Map<string, RoomEventRecord>()
      store.processedPlayerSubmitByRoom.set(room.id, processedSubmits)
      const processedEvent = processedSubmits.get(input.requestId)
      if (processedEvent) {
        return { ok: true, room, event: processedEvent }
      }
    }

    const session = store.triviaByRoom.get(room.id)
    if (!session || session.status !== "in_progress") {
      return { ok: false, code: "TRIVIA_NOT_ACTIVE" }
    }

    if (
      session.phase !== "question_active_primary_team" &&
      session.phase !== "question_active_steal_team"
    ) {
      return { ok: false, code: "INVALID_STATE_TRANSITION", state: room.state }
    }

    if (!session.currentResponderPlayerId || session.currentResponderPlayerId !== input.actorId) {
      return { ok: false, code: "TRIVIA_INVALID_RESPONDER" }
    }

    const selectedOption = parseTriviaOption(input.payload?.option)
    if (!selectedOption) {
      return { ok: false, code: "INVALID_OPTION" }
    }

    const question = currentTriviaQuestion(session)
    if (!question || !session.currentTeamId) {
      return { ok: false, code: "TRIVIA_NOT_ACTIVE" }
    }

    touchPlayer(input.roomId, input.actorId)
    session.answersByPlayer.set(input.actorId, (session.answersByPlayer.get(input.actorId) ?? 0) + 1)

    const wasCorrect = selectedOption === question.correctOption
    if (session.phase === "question_active_primary_team") {
      if (wasCorrect) {
        const scoreResult = addTeamScore(store, room.id, session.currentTeamId, 10)
        if (!scoreResult.ok) {
          return { ok: false, code: scoreResult.code }
        }

        session.lastResult = {
          correctOption: question.correctOption,
          answeredOption: selectedOption,
          wasCorrect: true,
          awardedTeamId: session.currentTeamId,
          awardedPoints: 10,
        }
        session.phase = "answer_reveal"
        recordRoomEvent(store, room.id, "trivia.answer_reveal", {
          questionId: question.id,
          playerId: input.actorId,
          teamId: session.currentTeamId,
          phase: "primary",
          wasCorrect: true,
          awardedPoints: 10,
          awardedTeamId: session.currentTeamId,
          selectedOption,
          correctOption: question.correctOption,
        })
      } else {
        const stealTeamId = getOppositeTeamId(store, room.id, session.currentTeamId)
        if (!stealTeamId) {
          session.lastResult = {
            correctOption: question.correctOption,
            answeredOption: selectedOption,
            wasCorrect: false,
            awardedTeamId: null,
            awardedPoints: 0,
          }
          session.phase = "answer_reveal"
          recordRoomEvent(store, room.id, "trivia.answer_reveal", {
            questionId: question.id,
            playerId: input.actorId,
            teamId: session.currentTeamId,
            phase: "primary",
            wasCorrect: false,
            awardedPoints: 0,
            awardedTeamId: null,
            selectedOption,
            correctOption: question.correctOption,
          })
        } else {
          const stealResponder = selectResponderForTeam(store, room.id, stealTeamId, session)
          if (!stealResponder) {
            session.lastResult = {
              correctOption: question.correctOption,
              answeredOption: selectedOption,
              wasCorrect: false,
              awardedTeamId: null,
              awardedPoints: 0,
            }
            session.phase = "answer_reveal"
            recordRoomEvent(store, room.id, "trivia.answer_reveal", {
              questionId: question.id,
              playerId: input.actorId,
              teamId: session.currentTeamId,
              phase: "primary",
              wasCorrect: false,
              awardedPoints: 0,
              awardedTeamId: null,
              selectedOption,
              correctOption: question.correctOption,
            })
          } else {
            session.currentTeamId = stealTeamId
            session.currentResponderPlayerId = stealResponder
            session.phase = "question_active_steal_team"
            recordRoomEvent(store, room.id, "trivia.steal_ready", {
              questionId: question.id,
              fromTeamId: getOppositeTeamId(store, room.id, stealTeamId),
              toTeamId: stealTeamId,
              responderPlayerId: stealResponder,
              selectedOption,
            })
          }
        }
      }
    } else {
      if (wasCorrect) {
        const scoreResult = addTeamScore(store, room.id, session.currentTeamId, 6)
        if (!scoreResult.ok) {
          return { ok: false, code: scoreResult.code }
        }
      }

      session.lastResult = {
        correctOption: question.correctOption,
        answeredOption: selectedOption,
        wasCorrect,
        awardedTeamId: wasCorrect ? session.currentTeamId : null,
        awardedPoints: wasCorrect ? 6 : 0,
      }
      session.phase = "answer_reveal"
      recordRoomEvent(store, room.id, "trivia.answer_reveal", {
        questionId: question.id,
        playerId: input.actorId,
        teamId: session.currentTeamId,
        phase: "steal",
        wasCorrect,
        awardedPoints: wasCorrect ? 6 : 0,
        awardedTeamId: wasCorrect ? session.currentTeamId : null,
        selectedOption,
        correctOption: question.correctOption,
      })
    }
  } else {
    return { ok: false, code: "ACTION_NOT_SUPPORTED" }
  }

  const event = getLatestRoomEvent(store, input.roomId)
  if (!event) {
    return { ok: false, code: "ACTION_NOT_SUPPORTED" }
  }

  if (input.actionType === "player.submitAnswer" && input.requestId) {
    const processedSubmits = store.processedPlayerSubmitByRoom.get(room.id) ?? new Map<string, RoomEventRecord>()
    processedSubmits.set(input.requestId, event)
    if (processedSubmits.size > 300) {
      const oldestKey = processedSubmits.keys().next().value
      if (typeof oldestKey === "string") {
        processedSubmits.delete(oldestKey)
      }
    }
    store.processedPlayerSubmitByRoom.set(room.id, processedSubmits)
  }

  return { ok: true, room, event }
}

export function getPlayerInRoom(roomId: string, playerId: string): PlayerRecord | null {
  const store = getStore()
  const player = store.players.get(playerId)
  if (!player || player.roomId !== roomId) {
    return null
  }

  return player
}

export function touchPlayer(roomId: string, playerId: string): boolean {
  const player = getPlayerInRoom(roomId, playerId)
  const room = getRoom(roomId)

  if (!player || !room) {
    return false
  }

  const timestamp = nowMs()
  player.lastSeenAt = timestamp
  room.updatedAt = timestamp
  return true
}

export function buildRoomSnapshot(roomId: string): RoomSnapshot | null {
  const store = getStore()
  const room = getRoom(roomId)
  if (!room) {
    return null
  }

  const playerIds = Array.from(store.playersByRoom.get(roomId) ?? [])
  const players = playerIds
    .map((playerId) => store.players.get(playerId))
    .filter((player): player is PlayerRecord => Boolean(player))
    .sort((a, b) => a.joinedAt - b.joinedAt)
    .map((player) => ({
      playerId: player.id,
      displayName: player.displayName,
      avatarType: player.avatarType,
      avatarValue: player.avatarValue,
      lastSeenAt: player.lastSeenAt,
    }))

  ensureTeamsSeeded(store, roomId)
  const teamAssignmentsMap = store.playerTeamsByRoom.get(roomId) ?? new Map<string, string>()
  const teams = (store.teamsByRoom.get(roomId) ?? [])
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((team) => ({
      teamId: team.id,
      name: team.name,
      order: team.order,
      score: team.score,
      playerCount: Array.from(teamAssignmentsMap.values()).filter((teamId) => teamId === team.id).length,
    }))

  const teamAssignments = Array.from(teamAssignmentsMap.entries()).map(([playerId, teamId]) => ({
    playerId,
    teamId,
  }))

  return {
    roomId: room.id,
    hostId: room.hostId,
    state: room.state,
    version: room.version,
    createdAt: room.createdAt,
    updatedAt: room.updatedAt,
    expiresAt: room.expiresAt,
    playerCount: players.length,
    players,
    teams,
    teamAssignments,
    trivia: toTriviaSnapshot(store.triviaByRoom.get(roomId) ?? null),
  }
}

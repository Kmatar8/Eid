import { createHash, randomUUID } from "crypto"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

import { hashPassword, verifyPassword } from "@/lib/server/password"
import type { ClientActionType, ClientRole } from "@/lib/server/protocol-v1"
import bundledHostCredentialSeeds from "@/lib/server/host-credentials.generated.json"
import { TRIVIA_CATEGORY_ORDER, TRIVIA_QUESTION_BANK } from "@/lib/server/trivia-bank"
import type {
  AvatarType,
  HostRecord,
  PlayerRecord,
  RedeemCodeRecord,
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
const HOST_INACTIVITY_MS = 10 * 60 * 1000
const MAX_ROOM_EVENTS = 4000
const TRIVIA_COUNTDOWN_MS = 5 * 1000
const TRIVIA_BUZZ_WINDOW_MS = 20 * 1000
const TRIVIA_ANSWER_WINDOW_MS = 20 * 1000
const REDEEMED_CODE_EXPIRY_MS = 1000 * 60 * 60 * 24 * 30
const HOST_ACCESS_DURATION_MONTHS = 2
const DEFAULT_HOST_TOKEN_TTL_SECONDS = 60 * 60 * 12
const HOST_SESSION_PLACEHOLDER_PASSWORD_HASH = hashPassword("host-session-placeholder")

type InMemoryStore = {
  seeded: boolean
  revision: number
  nextEventSeq: number
  hosts: Map<string, HostRecord>
  hostsByUsername: Map<string, string>
  hostsByEmail: Map<string, string>
  redeemCodesByHash: Map<string, RedeemCodeRecord>
  rooms: Map<string, RoomRecord>
  players: Map<string, PlayerRecord>
  playersByRoom: Map<string, Set<string>>
  teamsByRoom: Map<string, TeamRecord[]>
  playerTeamsByRoom: Map<string, Map<string, string>>
  triviaByRoom: Map<string, TriviaSession>
  hostLastSeenByRoom: Map<string, number>
  pausedFromStateByRoom: Map<string, RoomState>
  processedHostCommandsByRoom: Map<string, Set<string>>
  processedPlayerSubmitByRoom: Map<string, Map<string, RoomEventRecord>>
  roomEvents: RoomEventRecord[]
}

type HostSeedInput = {
  username: string
  email?: string
  passwordHash?: string
  password?: string
  accessExpiresAt?: number | null
}

type RedeemCodeSeedInput = {
  code?: string
  codeHash?: string
  email?: string | null
  expiresAt?: number | null
}

type TriviaClueState = {
  question: TriviaQuestion
  used: boolean
}

type TriviaSession = {
  status: "in_progress" | "completed"
  phase: TriviaPhase
  board: Array<{
    categoryId: string
    name: string
    clues: TriviaClueState[]
  }>
  questionIndex: number
  totalQuestions: number
  currentTeamId: string | null
  currentPickerPlayerId: string | null
  currentResponderPlayerId: string | null
  currentResponderTeamId: string | null
  selectedQuestionId: string | null
  countdownEndsAt: number | null
  buzzEndsAt: number | null
  answerEndsAt: number | null
  lastResult: TriviaSnapshot["lastResult"]
  answersByPlayer: Map<string, number>
  picksByPlayer: Map<string, number>
  rngSeed: number
}

type GlobalWithStore = typeof globalThis & {
  __hroofInMemoryStore?: InMemoryStore
  __hroofRoomEventSubscribers?: Map<string, Set<RoomEventSubscriber>>
}

type RoomEventSubscriber = (event: RoomEventRecord) => void

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

function addUtcMonths(fromMs: number, months: number) {
  const from = new Date(fromMs)
  const targetMonth = from.getUTCMonth() + months
  const targetYear = from.getUTCFullYear() + Math.floor(targetMonth / 12)
  const normalizedMonth = ((targetMonth % 12) + 12) % 12
  const maxDay = new Date(Date.UTC(targetYear, normalizedMonth + 1, 0)).getUTCDate()
  const targetDay = Math.min(from.getUTCDate(), maxDay)

  return Date.UTC(
    targetYear,
    normalizedMonth,
    targetDay,
    from.getUTCHours(),
    from.getUTCMinutes(),
    from.getUTCSeconds(),
    from.getUTCMilliseconds()
  )
}

function getRoomEventSubscribersMap() {
  const globalStore = globalThis as GlobalWithStore
  if (!globalStore.__hroofRoomEventSubscribers) {
    globalStore.__hroofRoomEventSubscribers = new Map<string, Set<RoomEventSubscriber>>()
  }
  return globalStore.__hroofRoomEventSubscribers
}

function notifyRoomEventSubscribers(event: RoomEventRecord) {
  const subscribers = getRoomEventSubscribersMap().get(event.roomId)
  if (!subscribers || subscribers.size === 0) {
    return
  }

  const snapshot = [...subscribers]
  for (const subscriber of snapshot) {
    try {
      subscriber(event)
    } catch {
      // Best-effort notification only.
    }
  }
}

export function subscribeRoomEvents(roomId: string, subscriber: RoomEventSubscriber) {
  const subscribersByRoom = getRoomEventSubscribersMap()
  const existing = subscribersByRoom.get(roomId) ?? new Set<RoomEventSubscriber>()
  existing.add(subscriber)
  subscribersByRoom.set(roomId, existing)

  return () => {
    const current = subscribersByRoom.get(roomId)
    if (!current) {
      return
    }
    current.delete(subscriber)
    if (current.size === 0) {
      subscribersByRoom.delete(roomId)
    }
  }
}

function getStore(): InMemoryStore {
  const globalStore = globalThis as GlobalWithStore
  if (!globalStore.__hroofInMemoryStore) {
    globalStore.__hroofInMemoryStore = {
      seeded: false,
      revision: 0,
      nextEventSeq: 1,
      hosts: new Map(),
      hostsByUsername: new Map(),
      hostsByEmail: new Map(),
      redeemCodesByHash: new Map(),
      rooms: new Map(),
      players: new Map(),
      playersByRoom: new Map(),
      teamsByRoom: new Map(),
      playerTeamsByRoom: new Map(),
      triviaByRoom: new Map(),
      hostLastSeenByRoom: new Map(),
      pausedFromStateByRoom: new Map(),
      processedHostCommandsByRoom: new Map(),
      processedPlayerSubmitByRoom: new Map(),
      roomEvents: [],
    }
  }

  const store = globalStore.__hroofInMemoryStore
  if (!store.seeded) {
    seedHosts(store)
    seedRedeemCodes(store)
    store.seeded = true
    return store
  }

  // Keep host/redeem seed sync idempotent so newly generated CSV/JSON credentials
  // are imported even when the shared store was already hydrated from Durable Objects.
  seedHosts(store)
  seedRedeemCodes(store)
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

type RoomShardSnapshot = {
  room: RoomRecord | null
  players: PlayerRecord[]
  teams: TeamRecord[]
  teamAssignments: Array<[string, string]>
  trivia: TriviaSession | null
  hostLastSeenAt: number | null
  pausedFromState: RoomState | null
  processedHostCommands: string[]
  processedPlayerSubmit: Array<[string, RoomEventRecord]>
  roomEvents: RoomEventRecord[]
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
    typeof candidate.revision === "number" &&
    typeof candidate.nextEventSeq === "number" &&
    candidate.hosts instanceof Map &&
    candidate.hostsByUsername instanceof Map &&
    candidate.hostsByEmail instanceof Map &&
    candidate.redeemCodesByHash instanceof Map &&
    candidate.rooms instanceof Map &&
    candidate.players instanceof Map &&
    candidate.playersByRoom instanceof Map &&
    candidate.teamsByRoom instanceof Map &&
    candidate.playerTeamsByRoom instanceof Map &&
    candidate.triviaByRoom instanceof Map &&
    candidate.hostLastSeenByRoom instanceof Map &&
    candidate.pausedFromStateByRoom instanceof Map &&
    candidate.processedHostCommandsByRoom instanceof Map &&
    candidate.processedPlayerSubmitByRoom instanceof Map &&
    Array.isArray(candidate.roomEvents)
  )
}

export function exportStoreSnapshot(): unknown {
  const store = getStore()
  return JSON.parse(JSON.stringify(store, encodeStoreValue))
}

function removeRoomScopedStoreData(store: InMemoryStore, roomId: string) {
  store.rooms.delete(roomId)

  const currentPlayers = store.playersByRoom.get(roomId) ?? new Set<string>()
  for (const playerId of currentPlayers) {
    store.players.delete(playerId)
  }
  store.playersByRoom.delete(roomId)

  store.teamsByRoom.delete(roomId)
  store.playerTeamsByRoom.delete(roomId)
  store.triviaByRoom.delete(roomId)
  store.hostLastSeenByRoom.delete(roomId)
  store.pausedFromStateByRoom.delete(roomId)
  store.processedHostCommandsByRoom.delete(roomId)
  store.processedPlayerSubmitByRoom.delete(roomId)
  store.roomEvents = store.roomEvents.filter((event) => event.roomId !== roomId)
}

export function exportRoomShardSnapshot(roomId: string): unknown | null {
  const store = getStore()
  const room = store.rooms.get(roomId)
  if (!room) {
    return null
  }

  const playerIds = Array.from(store.playersByRoom.get(roomId) ?? [])
  const players = playerIds
    .map((playerId) => store.players.get(playerId))
    .filter((player): player is PlayerRecord => Boolean(player))

  const teams = [...(store.teamsByRoom.get(roomId) ?? [])]
  const teamAssignments = Array.from((store.playerTeamsByRoom.get(roomId) ?? new Map<string, string>()).entries())
  const trivia = store.triviaByRoom.get(roomId) ?? null
  const hostLastSeenAt = store.hostLastSeenByRoom.get(roomId) ?? null
  const pausedFromState = store.pausedFromStateByRoom.get(roomId) ?? null
  const processedHostCommands = Array.from(store.processedHostCommandsByRoom.get(roomId) ?? new Set<string>())
  const processedPlayerSubmit = Array.from(
    (store.processedPlayerSubmitByRoom.get(roomId) ?? new Map<string, RoomEventRecord>()).entries()
  )
  const roomEvents = store.roomEvents.filter((event) => event.roomId === roomId)

  const shard: RoomShardSnapshot = {
    room,
    players,
    teams,
    teamAssignments,
    trivia,
    hostLastSeenAt,
    pausedFromState,
    processedHostCommands,
    processedPlayerSubmit,
    roomEvents,
  }

  return JSON.parse(JSON.stringify(shard, encodeStoreValue))
}

export function getStoreRevision() {
  return getStore().revision
}

export function importRoomShardSnapshot(roomId: string, snapshot: unknown): boolean {
  if (!snapshot || typeof snapshot !== "object") {
    return false
  }

  try {
    const restored = JSON.parse(JSON.stringify(snapshot), decodeStoreValue) as unknown
    if (!restored || typeof restored !== "object") {
      return false
    }

    const candidate = restored as Partial<RoomShardSnapshot>
    if (
      !Array.isArray(candidate.players) ||
      !Array.isArray(candidate.teams) ||
      !Array.isArray(candidate.teamAssignments) ||
      !Array.isArray(candidate.processedHostCommands) ||
      !Array.isArray(candidate.processedPlayerSubmit) ||
      !Array.isArray(candidate.roomEvents)
    ) {
      return false
    }

    if (candidate.room && candidate.room.id !== roomId) {
      return false
    }

    const store = getStore()
    removeRoomScopedStoreData(store, roomId)

    if (candidate.room) {
      store.rooms.set(roomId, candidate.room)
    }

    const playerIds = new Set<string>()
    for (const player of candidate.players) {
      if (!player || player.roomId !== roomId || typeof player.id !== "string") {
        continue
      }
      store.players.set(player.id, player)
      playerIds.add(player.id)
    }
    store.playersByRoom.set(roomId, playerIds)

    const teams = candidate.teams
      .filter((team): team is TeamRecord => Boolean(team && typeof team.id === "string"))
      .map((team) => ({ ...team, roomId }))
    store.teamsByRoom.set(roomId, teams)

    const assignmentMap = new Map<string, string>()
    for (const entry of candidate.teamAssignments) {
      if (!Array.isArray(entry) || typeof entry[0] !== "string" || typeof entry[1] !== "string") {
        continue
      }
      assignmentMap.set(entry[0], entry[1])
    }
    store.playerTeamsByRoom.set(roomId, assignmentMap)

    if (candidate.trivia) {
      store.triviaByRoom.set(roomId, candidate.trivia)
    }

    if (typeof candidate.hostLastSeenAt === "number") {
      store.hostLastSeenByRoom.set(roomId, candidate.hostLastSeenAt)
    }

    if (candidate.pausedFromState) {
      store.pausedFromStateByRoom.set(roomId, candidate.pausedFromState)
    }

    const processedHostCommands = new Set(
      candidate.processedHostCommands.filter((requestId): requestId is string => typeof requestId === "string")
    )
    if (processedHostCommands.size > 0) {
      store.processedHostCommandsByRoom.set(roomId, processedHostCommands)
    }

    const processedSubmitByRequestId = new Map<string, RoomEventRecord>()
    for (const entry of candidate.processedPlayerSubmit) {
      if (
        !Array.isArray(entry) ||
        typeof entry[0] !== "string" ||
        !entry[1] ||
        typeof entry[1] !== "object" ||
        (entry[1] as RoomEventRecord).roomId !== roomId
      ) {
        continue
      }
      processedSubmitByRequestId.set(entry[0], entry[1] as RoomEventRecord)
    }
    if (processedSubmitByRequestId.size > 0) {
      store.processedPlayerSubmitByRoom.set(roomId, processedSubmitByRequestId)
    }

    const roomEvents = candidate.roomEvents.filter((event): event is RoomEventRecord => {
      return (
        Boolean(event) &&
        typeof event.roomId === "string" &&
        event.roomId === roomId &&
        typeof event.seq === "number" &&
        Number.isFinite(event.seq)
      )
    })
    store.roomEvents.push(...roomEvents)
    store.roomEvents.sort((a, b) => a.seq - b.seq)
    if (store.roomEvents.length > MAX_ROOM_EVENTS) {
      store.roomEvents.splice(0, store.roomEvents.length - MAX_ROOM_EVENTS)
    }

    const maxSeq = store.roomEvents.reduce((max, event) => Math.max(max, event.seq), 0)
    store.nextEventSeq = maxSeq + 1
    return true
  } catch {
    return false
  }
}

export function importStoreSnapshot(snapshot: unknown): boolean {
  if (!snapshot || typeof snapshot !== "object") {
    return false
  }

  try {
    const restored = JSON.parse(JSON.stringify(snapshot), decodeStoreValue) as unknown
    if (restored && typeof restored === "object") {
      const candidate = restored as Partial<InMemoryStore> & Record<string, unknown>
      if (typeof candidate.revision !== "number") {
        candidate.revision = 0
      }
      if (typeof candidate.nextEventSeq !== "number") {
        const currentEvents = Array.isArray(candidate.roomEvents) ? candidate.roomEvents : []
        const maxSeq = currentEvents.reduce((max, event) => {
          if (!event || typeof event !== "object") {
            return max
          }
          const seq = (event as { seq?: unknown }).seq
          return typeof seq === "number" && Number.isFinite(seq) ? Math.max(max, seq) : max
        }, 0)
        candidate.nextEventSeq = maxSeq + 1
      }
      if (!(candidate.processedPlayerSubmitByRoom instanceof Map)) {
        candidate.processedPlayerSubmitByRoom = new Map()
      }
      if (!(candidate.hostLastSeenByRoom instanceof Map)) {
        candidate.hostLastSeenByRoom = new Map()
      }
      if (!(candidate.pausedFromStateByRoom instanceof Map)) {
        candidate.pausedFromStateByRoom = new Map()
      }
      if (!(candidate.hostsByEmail instanceof Map)) {
        candidate.hostsByEmail = new Map()
      }
      if (!(candidate.redeemCodesByHash instanceof Map)) {
        candidate.redeemCodesByHash = new Map()
      }
      if (candidate.hosts instanceof Map && candidate.hostsByEmail instanceof Map) {
        const rebuiltHostEmailMap = new Map<string, string>()
        for (const [hostId, hostValue] of candidate.hosts.entries()) {
          if (typeof hostId !== "string") {
            continue
          }

          if (!hostValue || typeof hostValue !== "object") {
            continue
          }

          const hostRecord = hostValue as HostRecord
          const host = hostValue as Partial<HostRecord>
          if (typeof host.accessExpiresAt !== "number") {
            hostRecord.accessExpiresAt = null
          }

          if (typeof host.email !== "string") {
            hostRecord.email = null
            continue
          }

          const normalizedEmail = normalizeEmail(host.email)
          hostRecord.email = normalizedEmail
          rebuiltHostEmailMap.set(normalizedEmail, hostId)
        }
        candidate.hostsByEmail = rebuiltHostEmailMap
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
    return getFallbackHostSeedInputs()
  }

  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) {
      return getFallbackHostSeedInputs()
    }

    const safeInputs: HostSeedInput[] = []
    for (const item of parsed) {
      if (!item || typeof item !== "object") {
        continue
      }

      const candidate = item as Record<string, unknown>
      const username = typeof candidate.username === "string" ? candidate.username.trim() : ""
      const email = typeof candidate.email === "string" ? normalizeEmail(candidate.email) : undefined
      const passwordHash = typeof candidate.passwordHash === "string" ? candidate.passwordHash : undefined
      const password = typeof candidate.password === "string" ? candidate.password : undefined
      const accessExpiresAt = parseTimestampValue(candidate.accessExpiresAt)

      if (!username || (!passwordHash && !password)) {
        continue
      }

      safeInputs.push({ username, email, passwordHash, password, accessExpiresAt })
    }

    if (safeInputs.length === 0) {
      return getFallbackHostSeedInputs()
    }

    return safeInputs
  } catch {
    return getFallbackHostSeedInputs()
  }
}

function normalizeEmail(value: string) {
  return value.trim().toLowerCase()
}

function normalizeRedeemCode(value: string) {
  return value.trim().toUpperCase()
}

function hashRedeemCode(code: string) {
  const normalized = normalizeRedeemCode(code)
  return createHash("sha256").update(normalized).digest("hex")
}

function parseTimestampValue(input: unknown): number | null {
  if (input === null || input === undefined || input === "") {
    return null
  }

  if (typeof input === "number" && Number.isFinite(input)) {
    return input
  }

  if (typeof input === "string") {
    const asNumber = Number.parseInt(input, 10)
    if (Number.isFinite(asNumber)) {
      return asNumber
    }

    const parsed = Date.parse(input)
    if (Number.isFinite(parsed)) {
      return parsed
    }
  }

  return null
}

function parseHostSeedCsv(raw: string): HostSeedInput[] {
  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
  if (lines.length <= 1) {
    return []
  }

  const header = lines[0]?.split(",").map((value) => value.trim().toLowerCase()) ?? []
  const codeIndex = header.indexOf("code")
  const usernameIndex = header.indexOf("username")
  const passwordIndex = header.indexOf("password")
  const emailIndex = header.indexOf("email")
  const accessExpiresAtIndex = Math.max(header.indexOf("accessexpiresat"), header.indexOf("access_expires_at"))
  if ((codeIndex < 0 && usernameIndex < 0) || passwordIndex < 0) {
    return []
  }

  const parsed: HostSeedInput[] = []
  for (let index = 1; index < lines.length; index += 1) {
    const line = lines[index]
    if (!line) {
      continue
    }

    const columns = line.split(",").map((value) => value.trim())
    const usernameValue =
      usernameIndex >= 0 ? columns[usernameIndex] : codeIndex >= 0 ? columns[codeIndex] : undefined
    const username = typeof usernameValue === "string" ? usernameValue.trim() : ""
    const password = columns[passwordIndex]
    const email = emailIndex >= 0 && columns[emailIndex] ? normalizeEmail(columns[emailIndex]) : undefined
    const accessExpiresAt =
      accessExpiresAtIndex >= 0 ? parseTimestampValue(columns[accessExpiresAtIndex]) : null

    if (!username || !password) {
      continue
    }

    parsed.push({ username, password, email, accessExpiresAt })
  }

  return parsed
}

function parseHostSeedCsvFromFile(): HostSeedInput[] {
  const filePath = process.env.HROOF_HOST_CREDENTIALS_CSV_PATH ?? "docs/seeds/host-redeem-codes.csv"
  try {
    const absolutePath = resolve(process.cwd(), filePath)
    const raw = readFileSync(absolutePath, "utf8")
    return parseHostSeedCsv(raw)
  } catch {
    return []
  }
}

function parseBundledHostSeedInputs(): HostSeedInput[] {
  if (!Array.isArray(bundledHostCredentialSeeds)) {
    return []
  }

  const parsed: HostSeedInput[] = []
  for (const item of bundledHostCredentialSeeds) {
    if (!item || typeof item !== "object") {
      continue
    }

    const candidate = item as Record<string, unknown>
    const username = typeof candidate.username === "string" ? candidate.username.trim() : ""
    const passwordHash = typeof candidate.passwordHash === "string" ? candidate.passwordHash : undefined
    const password = typeof candidate.password === "string" ? candidate.password : undefined
    const email = typeof candidate.email === "string" ? normalizeEmail(candidate.email) : undefined
    const accessExpiresAt = parseTimestampValue(candidate.accessExpiresAt)

    if (!username || (!passwordHash && !password)) {
      continue
    }

    parsed.push({ username, passwordHash, password, email, accessExpiresAt })
  }

  return parsed
}

function getFallbackHostSeedInputs(): HostSeedInput[] {
  const bundledSeeds = parseBundledHostSeedInputs()
  if (bundledSeeds.length > 0) {
    return bundledSeeds
  }

  const csvSeeds = parseHostSeedCsvFromFile()
  if (csvSeeds.length > 0) {
    return csvSeeds
  }

  return [{ username: "host-demo", email: "host-demo@hroof.local", password: "demo1234" }]
}

function parseRedeemCodeCsv(raw: string): RedeemCodeSeedInput[] {
  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
  if (lines.length <= 1) {
    return []
  }

  const header = lines[0]?.split(",").map((value) => value.trim().toLowerCase()) ?? []
  const codeIndex = header.indexOf("code")
  const emailIndex = header.indexOf("email")
  const expiresAtIndex = Math.max(header.indexOf("expiresat"), header.indexOf("expires_at"))

  if (codeIndex < 0) {
    return []
  }

  const parsed: RedeemCodeSeedInput[] = []
  for (let index = 1; index < lines.length; index += 1) {
    const line = lines[index]
    if (!line) {
      continue
    }

    const columns = line.split(",").map((value) => value.trim())
    const code = columns[codeIndex] ? normalizeRedeemCode(columns[codeIndex]) : undefined
    const email =
      emailIndex >= 0 && columns[emailIndex] ? normalizeEmail(columns[emailIndex]) : null
    const expiresAt = expiresAtIndex >= 0 ? parseTimestampValue(columns[expiresAtIndex]) : null

    if (!code) {
      continue
    }

    parsed.push({ code, email, expiresAt })
  }

  return parsed
}

function parseRedeemCodeCsvFromFile(): RedeemCodeSeedInput[] {
  const filePath = process.env.HROOF_REDEEM_CODES_CSV_PATH ?? "docs/seeds/host-redeem-codes.csv"
  try {
    const absolutePath = resolve(process.cwd(), filePath)
    const raw = readFileSync(absolutePath, "utf8")
    return parseRedeemCodeCsv(raw)
  } catch {
    return []
  }
}

function getFallbackRedeemCodeSeeds(): RedeemCodeSeedInput[] {
  const csvSeeds = parseRedeemCodeCsvFromFile()
  if (csvSeeds.length > 0) {
    return csvSeeds
  }

  return [{ code: "Q7M4ZP9X2L" }]
}

function parseRedeemCodeSeedInputs(): RedeemCodeSeedInput[] {
  const raw = process.env.HROOF_REDEEM_CODES_JSON
  if (!raw) {
    return getFallbackRedeemCodeSeeds()
  }

  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) {
      return getFallbackRedeemCodeSeeds()
    }

    const safeInputs: RedeemCodeSeedInput[] = []
    for (const item of parsed) {
      if (!item || typeof item !== "object") {
        continue
      }

      const candidate = item as Record<string, unknown>
      const code = typeof candidate.code === "string" ? normalizeRedeemCode(candidate.code) : undefined
      const codeHash = typeof candidate.codeHash === "string" ? candidate.codeHash.trim() : undefined
      const email = typeof candidate.email === "string" ? normalizeEmail(candidate.email) : null
      const expiresAt = parseTimestampValue(candidate.expiresAt)

      if (!code && !codeHash) {
        continue
      }

      safeInputs.push({ code, codeHash, email, expiresAt })
    }

    if (safeInputs.length === 0) {
      return getFallbackRedeemCodeSeeds()
    }

    return safeInputs
  } catch {
    return getFallbackRedeemCodeSeeds()
  }
}

function seedHosts(store: InMemoryStore) {
  const seeds = parseHostSeedInputs()
  let insertedCount = 0

  for (const seed of seeds) {
    const username = seed.username.trim()
    if (!username || store.hostsByUsername.has(username)) {
      continue
    }

    const normalizedEmail = seed.email ? normalizeEmail(seed.email) : null
    if (normalizedEmail && store.hostsByEmail.has(normalizedEmail)) {
      continue
    }

    const id = `host_${randomUUID()}`
    const host: HostRecord = {
      id,
      username,
      email: normalizedEmail,
      passwordHash: seed.passwordHash ?? hashPassword(seed.password ?? "change-me"),
      accessExpiresAt: seed.accessExpiresAt ?? null,
      activeRoomId: null,
      createdAt: nowMs(),
    }

    store.hosts.set(host.id, host)
    store.hostsByUsername.set(host.username, host.id)
    if (host.email) {
      store.hostsByEmail.set(host.email, host.id)
    }
    insertedCount += 1
  }

  if (insertedCount > 0) {
    store.revision += insertedCount
  }
}

function seedRedeemCodes(store: InMemoryStore) {
  const seeds = parseRedeemCodeSeedInputs()
  const now = nowMs()
  let insertedCount = 0

  for (const seed of seeds) {
    const codeHash = seed.codeHash || (seed.code ? hashRedeemCode(seed.code) : "")
    if (!codeHash || store.redeemCodesByHash.has(codeHash)) {
      continue
    }

    const expiresAt = seed.expiresAt ?? null
    const record: RedeemCodeRecord = {
      id: `redeem_${randomUUID()}`,
      codeHash,
      email: seed.email ? normalizeEmail(seed.email) : null,
      status: expiresAt && now > expiresAt ? "expired" : "active",
      createdAt: now,
      expiresAt,
      redeemedAt: null,
      redeemedByHostId: null,
    }

    store.redeemCodesByHash.set(record.codeHash, record)
    insertedCount += 1
  }

  if (insertedCount > 0) {
    store.revision += insertedCount
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

  const roomEvent: RoomEventRecord = {
    id: `evt_${randomUUID()}`,
    seq: store.nextEventSeq,
    roomId,
    roomVersion: room?.version ?? 0,
    eventType,
    payload,
    createdAt,
  }
  store.roomEvents.push(roomEvent)
  store.revision += 1
  store.nextEventSeq += 1
  notifyRoomEventSubscribers(roomEvent)

  if (store.roomEvents.length > MAX_ROOM_EVENTS) {
    store.roomEvents.splice(0, store.roomEvents.length - MAX_ROOM_EVENTS)
  }
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

function shouldPauseForHostInactivity(state: RoomState) {
  return state === "lobby_locked" || state === "teams_ready" || state === "game_live" || state === "between_games"
}

function touchHostPresence(store: InMemoryStore, roomId: string) {
  store.hostLastSeenByRoom.set(roomId, nowMs())
}

function pauseRoomForHostInactivity(store: InMemoryStore, room: RoomRecord) {
  if (!shouldPauseForHostInactivity(room.state)) {
    return
  }

  const previousState = room.state
  room.state = "paused_wait_host"
  room.pausedAt = nowMs()
  store.pausedFromStateByRoom.set(room.id, previousState)
  recordRoomEvent(store, room.id, "room.paused_wait_host", {
    reason: "host_inactive",
    previousState,
    inactiveForMs: HOST_INACTIVITY_MS,
  })
}

function maybePauseForHostInactivity(store: InMemoryStore, room: RoomRecord) {
  if (!shouldPauseForHostInactivity(room.state)) {
    return
  }

  const lastSeenAt = store.hostLastSeenByRoom.get(room.id)
  if (!lastSeenAt) {
    touchHostPresence(store, room.id)
    return
  }

  if (nowMs() - lastSeenAt > HOST_INACTIVITY_MS) {
    pauseRoomForHostInactivity(store, room)
  }
}

function resolveResumeState(store: InMemoryStore, room: RoomRecord): RoomState {
  const stored = store.pausedFromStateByRoom.get(room.id)
  if (stored && stored !== "paused_wait_host" && stored !== "expired" && stored !== "session_completed") {
    return stored
  }

  const trivia = store.triviaByRoom.get(room.id)
  if (trivia && trivia.status === "in_progress") {
    return "game_live"
  }

  if (trivia && trivia.status === "completed") {
    return "between_games"
  }

  return "teams_ready"
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
  store.hostLastSeenByRoom.delete(room.id)
  store.pausedFromStateByRoom.delete(room.id)

  recordRoomEvent(store, room.id, "room.expired", { reason })
}

function applyTimeouts(store: InMemoryStore, room: RoomRecord) {
  maybePauseForHostInactivity(store, room)

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

function getTeamIdsInOrder(store: InMemoryStore, roomId: string): string[] {
  return (store.teamsByRoom.get(roomId) ?? [])
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((team) => team.id)
}

function getRemainingQuestionCount(session: TriviaSession) {
  let remaining = 0
  for (const category of session.board) {
    for (const clue of category.clues) {
      if (!clue.used) {
        remaining += 1
      }
    }
  }
  return remaining
}

function getQuestionById(session: TriviaSession, questionId: string | null): TriviaQuestion | null {
  if (!questionId) {
    return null
  }

  for (const category of session.board) {
    for (const clue of category.clues) {
      if (clue.question.id === questionId) {
        return clue.question
      }
    }
  }
  return null
}

function getCurrentTriviaQuestion(session: TriviaSession): TriviaQuestion | null {
  return getQuestionById(session, session.selectedQuestionId)
}

function markQuestionUsed(session: TriviaSession, questionId: string): boolean {
  for (const category of session.board) {
    for (const clue of category.clues) {
      if (clue.question.id === questionId) {
        if (clue.used) {
          return false
        }
        clue.used = true
        return true
      }
    }
  }
  return false
}

function pickTeamMemberForRole(
  store: InMemoryStore,
  roomId: string,
  teamId: string,
  session: TriviaSession,
  role: "picker" | "responder",
  excludePlayerId?: string | null
): string | null {
  const teamPlayerIds = getTeamPlayerIds(store, roomId, teamId).filter((playerId) => playerId !== excludePlayerId)
  if (teamPlayerIds.length === 0) {
    return null
  }

  const activeSince = nowMs() - 45_000
  const activePlayers = teamPlayerIds.filter((playerId) => {
    const player = store.players.get(playerId)
    return Boolean(player && player.lastSeenAt >= activeSince)
  })
  const candidatePool = activePlayers.length > 0 ? activePlayers : teamPlayerIds

  const usageMap = role === "picker" ? session.picksByPlayer : session.answersByPlayer
  const usage = candidatePool.map((playerId) => ({
    playerId,
    usage: usageMap.get(playerId) ?? 0,
  }))
  const minUsage = Math.min(...usage.map((entry) => entry.usage))
  const leastUsed = usage.filter((entry) => entry.usage === minUsage).map((entry) => entry.playerId)
  return pickRandom(leastUsed, session)
}

function getNextTurnTeamId(store: InMemoryStore, roomId: string, currentTeamId: string | null): string | null {
  const teamIds = getTeamIdsInOrder(store, roomId)
  if (teamIds.length === 0) {
    return null
  }

  const teamsWithPlayers = teamIds.filter((teamId) => getTeamPlayerIds(store, roomId, teamId).length > 0)
  if (teamsWithPlayers.length === 0) {
    return null
  }

  if (!currentTeamId) {
    return teamsWithPlayers[0] ?? null
  }

  const currentIndex = teamIds.indexOf(currentTeamId)
  if (currentIndex < 0) {
    return teamsWithPlayers[0] ?? null
  }

  for (let offset = 1; offset <= teamIds.length; offset += 1) {
    const candidate = teamIds[(currentIndex + offset) % teamIds.length]
    if (candidate && getTeamPlayerIds(store, roomId, candidate).length > 0) {
      return candidate
    }
  }

  return teamsWithPlayers[0] ?? null
}

function setTurnTeam(
  store: InMemoryStore,
  roomId: string,
  session: TriviaSession,
  teamId: string | null,
  options?: { clearResult?: boolean }
) {
  session.currentTeamId = teamId
  session.currentPickerPlayerId = teamId ? pickTeamMemberForRole(store, roomId, teamId, session, "picker") : null
  if (session.currentPickerPlayerId) {
    session.picksByPlayer.set(
      session.currentPickerPlayerId,
      (session.picksByPlayer.get(session.currentPickerPlayerId) ?? 0) + 1
    )
  }

  session.currentResponderPlayerId = null
  session.currentResponderTeamId = null
  session.selectedQuestionId = null
  session.countdownEndsAt = null
  session.buzzEndsAt = null
  session.answerEndsAt = null
  session.phase = "board_turn"
  if (options?.clearResult ?? true) {
    session.lastResult = null
  }
}

function completeTriviaSession(store: InMemoryStore, room: RoomRecord, session: TriviaSession, reason: string) {
  session.status = "completed"
  session.phase = "next_question_or_end"
  session.currentTeamId = null
  session.currentPickerPlayerId = null
  session.currentResponderPlayerId = null
  session.currentResponderTeamId = null
  session.selectedQuestionId = null
  session.countdownEndsAt = null
  session.buzzEndsAt = null
  session.answerEndsAt = null
  room.state = "between_games"
  recordRoomEvent(store, room.id, "trivia.completed", { reason })
}

function moveToNextTurn(store: InMemoryStore, room: RoomRecord, session: TriviaSession): boolean {
  if (getRemainingQuestionCount(session) === 0) {
    completeTriviaSession(store, room, session, "board_exhausted")
    return false
  }

  const nextTeamId = getNextTurnTeamId(store, room.id, session.currentTeamId)
  if (!nextTeamId) {
    completeTriviaSession(store, room, session, "no_eligible_teams")
    return false
  }

  setTurnTeam(store, room.id, session, nextTeamId)
  recordRoomEvent(store, room.id, "trivia.turn_started", {
    teamId: session.currentTeamId,
    pickerPlayerId: session.currentPickerPlayerId,
    remainingQuestions: getRemainingQuestionCount(session),
  })
  return true
}

function setAnswerReveal(
  store: InMemoryStore,
  roomId: string,
  session: TriviaSession,
  payload: {
    answeredOption: TriviaOption | null
    correctOption: TriviaOption
    awardedTeamId: string | null
    awardedPoints: number
    wasCorrect: boolean
    questionId: string
    reason: "correct" | "wrong" | "timeout" | "no_buzz" | "host_skip"
  }
) {
  session.lastResult = {
    questionId: payload.questionId,
    answeredOption: payload.answeredOption,
    correctOption: payload.correctOption,
    awardedPoints: payload.awardedPoints,
    awardedTeamId: payload.awardedTeamId,
    wasCorrect: payload.wasCorrect,
    reason: payload.reason,
  }
  session.phase = "answer_reveal"
  session.countdownEndsAt = null
  session.buzzEndsAt = null
  session.answerEndsAt = null

  recordRoomEvent(store, roomId, "trivia.answer_reveal", {
    questionId: payload.questionId,
    answeredOption: payload.answeredOption,
    correctOption: payload.correctOption,
    awardedTeamId: payload.awardedTeamId,
    awardedPoints: payload.awardedPoints,
    wasCorrect: payload.wasCorrect,
    reason: payload.reason,
    responderPlayerId: session.currentResponderPlayerId,
    responderTeamId: session.currentResponderTeamId,
  })
}

function applyTriviaTimedTransitions(store: InMemoryStore, room: RoomRecord, session: TriviaSession) {
  if (session.status !== "in_progress") {
    return
  }

  const now = nowMs()
  const question = getCurrentTriviaQuestion(session)
  if (!question) {
    return
  }

  if (session.phase === "countdown" && session.countdownEndsAt && now >= session.countdownEndsAt) {
    session.phase = "buzzer_open"
    session.countdownEndsAt = null
    session.buzzEndsAt = now + TRIVIA_BUZZ_WINDOW_MS
    recordRoomEvent(store, room.id, "trivia.question_revealed", {
      questionId: question.id,
      teamId: session.currentTeamId,
      buzzEndsAt: session.buzzEndsAt,
    })
    return
  }

  if (session.phase === "buzzer_open" && session.buzzEndsAt && now >= session.buzzEndsAt) {
    setAnswerReveal(store, room.id, session, {
      answeredOption: null,
      correctOption: question.correctOption,
      awardedTeamId: null,
      awardedPoints: 0,
      wasCorrect: false,
      questionId: question.id,
      reason: "no_buzz",
    })
    return
  }

  if (
    session.phase === "answer_active" &&
    session.answerEndsAt &&
    now >= session.answerEndsAt &&
    session.currentResponderTeamId
  ) {
    const scoreResult = addTeamScore(store, room.id, session.currentResponderTeamId, -question.points)
    const awardedPoints = scoreResult.ok ? -question.points : 0
    setAnswerReveal(store, room.id, session, {
      answeredOption: null,
      correctOption: question.correctOption,
      awardedTeamId: session.currentResponderTeamId,
      awardedPoints,
      wasCorrect: false,
      questionId: question.id,
      reason: "timeout",
    })
  }
}

function toTriviaSnapshot(session: TriviaSession | null): TriviaSnapshot {
  if (!session) {
    return {
      status: "idle",
      phase: null,
      questionIndex: -1,
      totalQuestions: 0,
      remainingQuestions: 0,
      currentTeamId: null,
      currentPickerPlayerId: null,
      currentResponderPlayerId: null,
      currentResponderTeamId: null,
      countdownEndsAt: null,
      buzzEndsAt: null,
      answerEndsAt: null,
      board: [],
      selectedClue: null,
      lastResult: null,
    }
  }

  const selected = getCurrentTriviaQuestion(session)
  return {
    status: session.status,
    phase: session.phase,
    questionIndex: session.questionIndex,
    totalQuestions: session.totalQuestions,
    remainingQuestions: getRemainingQuestionCount(session),
    currentTeamId: session.currentTeamId,
    currentPickerPlayerId: session.currentPickerPlayerId,
    currentResponderPlayerId: session.currentResponderPlayerId,
    currentResponderTeamId: session.currentResponderTeamId,
    countdownEndsAt: session.countdownEndsAt,
    buzzEndsAt: session.buzzEndsAt,
    answerEndsAt: session.answerEndsAt,
    board: session.board.map((category) => ({
      categoryId: category.categoryId,
      name: category.name,
      clues: category.clues.map((clue) => ({
        questionId: clue.question.id,
        points: clue.question.points,
        used: clue.used,
      })),
    })),
    selectedClue: selected
      ? {
          questionId: selected.id,
          categoryId: selected.categoryId,
          categoryName: selected.categoryName,
          points: selected.points,
          prompt: selected.prompt,
          options: selected.options,
        }
      : null,
    lastResult: session.lastResult,
  }
}

function parseTriviaOption(value: unknown): TriviaOption | null {
  if (value === "A" || value === "B" || value === "C" || value === "D") {
    return value
  }

  return null
}

function getPlayerTeamId(store: InMemoryStore, roomId: string, playerId: string): string | null {
  const teamMap = store.playerTeamsByRoom.get(roomId) ?? new Map<string, string>()
  return teamMap.get(playerId) ?? null
}

function isRedeemCodeExpired(record: RedeemCodeRecord) {
  return record.status === "redeemed" && typeof record.expiresAt === "number" && nowMs() > record.expiresAt
}

export function redeemHostCode(
  code: string
): { ok: true; email: string | null; redeemCodeHash: string } | { ok: false; code: "REDEEM_CODE_NOT_FOUND" | "REDEEM_CODE_ALREADY_REDEEMED" | "REDEEM_CODE_EXPIRED" } {
  const normalizedCode = normalizeRedeemCode(code)
  if (!normalizedCode) {
    return { ok: false, code: "REDEEM_CODE_NOT_FOUND" }
  }

  const store = getStore()
  const codeHash = hashRedeemCode(normalizedCode)
  const record = store.redeemCodesByHash.get(codeHash)
  if (!record) {
    return { ok: false, code: "REDEEM_CODE_NOT_FOUND" }
  }

  if (record.status === "expired" || isRedeemCodeExpired(record)) {
    record.status = "expired"
    return { ok: false, code: "REDEEM_CODE_EXPIRED" }
  }

  if (record.status === "redeemed") {
    return { ok: false, code: "REDEEM_CODE_ALREADY_REDEEMED" }
  }

  return {
    ok: true,
    email: record.email,
    redeemCodeHash: record.codeHash,
  }
}

export function registerHostFromRedeem(input: {
  redeemCodeHash: string
  email: string
  username: string
  password: string
}):
  | { ok: true; host: HostRecord }
  | {
      ok: false
      code:
        | "REDEEM_CODE_NOT_FOUND"
        | "REDEEM_CODE_ALREADY_REDEEMED"
        | "REDEEM_CODE_EXPIRED"
        | "REDEEM_EMAIL_MISMATCH"
        | "USERNAME_TAKEN"
        | "EMAIL_TAKEN"
    } {
  const store = getStore()
  const record = store.redeemCodesByHash.get(input.redeemCodeHash)
  if (!record) {
    return { ok: false, code: "REDEEM_CODE_NOT_FOUND" }
  }

  if (record.status === "expired" || isRedeemCodeExpired(record)) {
    record.status = "expired"
    return { ok: false, code: "REDEEM_CODE_EXPIRED" }
  }

  if (record.status === "redeemed") {
    return { ok: false, code: "REDEEM_CODE_ALREADY_REDEEMED" }
  }

  const normalizedEmail = normalizeEmail(input.email)
  if (record.email && normalizedEmail !== record.email) {
    return { ok: false, code: "REDEEM_EMAIL_MISMATCH" }
  }

  const username = input.username.trim()
  if (store.hostsByUsername.has(username)) {
    return { ok: false, code: "USERNAME_TAKEN" }
  }

  if (store.hostsByEmail.has(normalizedEmail)) {
    return { ok: false, code: "EMAIL_TAKEN" }
  }

  const createdAt = nowMs()
  const host: HostRecord = {
    id: `host_${randomUUID()}`,
    username,
    email: normalizedEmail,
    passwordHash: hashPassword(input.password),
    accessExpiresAt: addUtcMonths(createdAt, HOST_ACCESS_DURATION_MONTHS),
    activeRoomId: null,
    createdAt,
  }

  store.hosts.set(host.id, host)
  store.hostsByUsername.set(host.username, host.id)
  store.hostsByEmail.set(normalizedEmail, host.id)

  record.status = "redeemed"
  record.redeemedAt = nowMs()
  record.expiresAt = record.redeemedAt + REDEEMED_CODE_EXPIRY_MS
  record.redeemedByHostId = host.id

  return { ok: true, host }
}

export function isRoomActiveState(state: RoomState) {
  return ACTIVE_ROOM_STATES.has(state)
}

export function isRoomJoinableState(state: RoomState) {
  return state === "lobby_open"
}

function isHostAccessExpired(host: HostRecord) {
  return typeof host.accessExpiresAt === "number" && nowMs() > host.accessExpiresAt
}

export function resolveHostTokenTtlSeconds(host: HostRecord) {
  if (typeof host.accessExpiresAt !== "number") {
    return DEFAULT_HOST_TOKEN_TTL_SECONDS
  }

  const remainingSeconds = Math.floor((host.accessExpiresAt - nowMs()) / 1000)
  if (remainingSeconds <= 0) {
    return 0
  }

  return Math.min(DEFAULT_HOST_TOKEN_TTL_SECONDS, remainingSeconds)
}

export function ensureHostSessionRecord(input: { hostId: string; username: string }): HostRecord {
  const store = getStore()
  const hostId = input.hostId.trim()
  const normalizedUsername = normalizeRedeemCode(input.username)
  const now = nowMs()

  if (!hostId || !normalizedUsername) {
    throw new Error("hostId and username are required")
  }

  const existingById = store.hosts.get(hostId)
  if (existingById) {
    if (existingById.username !== normalizedUsername) {
      store.hostsByUsername.set(normalizedUsername, existingById.id)
      existingById.username = normalizedUsername
      store.revision += 1
    }
    return existingById
  }

  const host: HostRecord = {
    id: hostId,
    username: normalizedUsername,
    email: null,
    passwordHash: HOST_SESSION_PLACEHOLDER_PASSWORD_HASH,
    accessExpiresAt: null,
    activeRoomId: null,
    createdAt: now,
  }

  store.hosts.set(host.id, host)
  store.hostsByUsername.set(host.username, host.id)
  store.revision += 1
  return host
}

export function authenticateHost(username: string, password: string): HostRecord | null {
  const store = getStore()
  const normalizedUsername = username.trim()
  const hostId =
    store.hostsByUsername.get(normalizedUsername) ??
    store.hostsByUsername.get(normalizeRedeemCode(normalizedUsername))
  if (!hostId) {
    return null
  }

  const host = store.hosts.get(hostId)
  if (!host) {
    return null
  }

  if (!verifyPassword(password, host.passwordHash)) {
    return null
  }

  if (typeof host.accessExpiresAt !== "number") {
    host.accessExpiresAt = addUtcMonths(nowMs(), HOST_ACCESS_DURATION_MONTHS)
    store.revision += 1
  }

  if (isHostAccessExpired(host)) {
    return null
  }

  return host
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
  store.hostLastSeenByRoom.set(room.id, timestamp)
  store.pausedFromStateByRoom.delete(room.id)
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
  store.hostLastSeenByRoom.delete(room.id)
  store.pausedFromStateByRoom.delete(room.id)
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

function createTriviaSession(store: InMemoryStore, roomId: string): TriviaSession | null {
  const board = TRIVIA_CATEGORY_ORDER.map((category) => {
    const clues = TRIVIA_QUESTION_BANK.filter((question) => question.categoryId === category.id).sort(
      (a, b) => a.points - b.points
    )
    return {
      categoryId: category.id,
      name: category.name,
      clues: clues.map((question) => ({ question, used: false })),
    }
  })

  if (board.some((category) => category.clues.length !== 5)) {
    return null
  }

  const totalQuestions = board.reduce((acc, category) => acc + category.clues.length, 0)
  if (totalQuestions === 0) {
    return null
  }

  return {
    status: "in_progress",
    phase: "board_turn",
    board,
    questionIndex: 0,
    totalQuestions,
    currentTeamId: null,
    currentPickerPlayerId: null,
    currentResponderPlayerId: null,
    currentResponderTeamId: null,
    selectedQuestionId: null,
    countdownEndsAt: null,
    buzzEndsAt: null,
    answerEndsAt: null,
    lastResult: null,
    answersByPlayer: new Map(),
    picksByPlayer: new Map(),
    rngSeed: hashSeed(`${roomId}:trivia`),
  }
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
        | "ROOM_NOT_ACTIVE"
        | "HOST_ROOM_MISMATCH"
        | "PLAYER_NOT_FOUND"
        | "INVALID_STATE_TRANSITION"
        | "INVALID_TEAM_ASSIGNMENT"
        | "INVALID_TEAM_NAME"
        | "TEAM_NOT_FOUND"
        | "INVALID_DELTA"
        | "TRIVIA_NOT_ACTIVE"
        | "TRIVIA_INVALID_CLUE"
        | "TRIVIA_NO_ALTERNATE_RESPONDER"
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

function buildSyntheticAckEvent(room: RoomRecord, eventType: string, payload: Record<string, unknown>): RoomEventRecord {
  return {
    id: `evt_${randomUUID()}`,
    seq: room.version,
    roomId: room.id,
    roomVersion: room.version,
    eventType,
    payload,
    createdAt: nowMs(),
  }
}

export function applyRoomAction(input: ApplyRoomActionInput): ApplyRoomActionResult {
  const store = getStore()
  const room = getRoom(input.roomId)
  if (!room) {
    return { ok: false, code: "ROOM_NOT_FOUND" }
  }

  const sessionTick = store.triviaByRoom.get(room.id)
  if (sessionTick) {
    applyTriviaTimedTransitions(store, room, sessionTick)
  }

  if (input.actorRole === "host") {
    if (room.hostId !== input.actorId) {
      return { ok: false, code: "HOST_ROOM_MISMATCH" }
    }

    touchHostPresence(store, room.id)

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

    if (input.actionType === "host.heartbeat") {
      const event = buildSyntheticAckEvent(room, "host.heartbeat", { hostId: input.actorId })

      if (input.requestId) {
        const processed = store.processedHostCommandsByRoom.get(room.id) ?? new Set<string>()
        processed.add(input.requestId)
        store.processedHostCommandsByRoom.set(room.id, processed)
      }

      return { ok: true, room, event }
    }

    if (input.actionType === "host.resumeSession") {
      if (room.state !== "paused_wait_host") {
        return { ok: false, code: "INVALID_STATE_TRANSITION", state: room.state }
      }

      const nextState = resolveResumeState(store, room)
      room.state = nextState
      room.pausedAt = null
      store.pausedFromStateByRoom.delete(room.id)
      recordRoomEvent(store, room.id, "room.resumed_from_pause", {
        hostId: input.actorId,
        nextState,
      })

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

    if (room.state === "paused_wait_host") {
      return { ok: false, code: "INVALID_STATE_TRANSITION", state: room.state }
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
    } else if (input.actionType === "host.renameTeam") {
      if (room.state !== "lobby_open" && room.state !== "lobby_locked" && room.state !== "teams_ready") {
        return { ok: false, code: "INVALID_STATE_TRANSITION", state: room.state }
      }

      const teamId = typeof input.payload?.teamId === "string" ? input.payload.teamId : ""
      const requestedName = typeof input.payload?.name === "string" ? input.payload.name : ""
      const normalizedName = requestedName
        .trim()
        .replace(/\s+/g, " ")

      if (!teamId || normalizedName.length < 1 || normalizedName.length > 24) {
        return { ok: false, code: "INVALID_TEAM_NAME" }
      }

      ensureTeamsSeeded(store, room.id)
      const team = store.teamsByRoom.get(room.id)?.find((entry) => entry.id === teamId)
      if (!team) {
        return { ok: false, code: "TEAM_NOT_FOUND" }
      }

      team.name = normalizedName
      recordRoomEvent(store, room.id, "room.team_renamed", {
        hostId: input.actorId,
        teamId,
        name: normalizedName,
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

      const session = createTriviaSession(store, room.id)
      if (!session) {
        return { ok: false, code: "ACTION_NOT_SUPPORTED" }
      }

      const startingTeamId = getTeamIdsInOrder(store, room.id).find(
        (teamId) => getTeamPlayerIds(store, room.id, teamId).length > 0
      )
      if (!startingTeamId) {
        return { ok: false, code: "ACTION_NOT_SUPPORTED" }
      }

      setTurnTeam(store, room.id, session, startingTeamId)
      store.triviaByRoom.set(room.id, session)
      room.state = "game_live"
      room.pausedAt = null

      recordRoomEvent(store, room.id, "trivia.started", {
        hostId: input.actorId,
        totalQuestions: session.totalQuestions,
      })
      recordRoomEvent(store, room.id, "trivia.turn_started", {
        teamId: session.currentTeamId,
        pickerPlayerId: session.currentPickerPlayerId,
        remainingQuestions: getRemainingQuestionCount(session),
      })
    } else if (input.actionType === "host.selectTriviaClue") {
      const session = store.triviaByRoom.get(room.id)
      if (!session || session.status !== "in_progress") {
        return { ok: false, code: "TRIVIA_NOT_ACTIVE" }
      }

      if (session.phase !== "board_turn" || !session.currentTeamId) {
        return { ok: false, code: "INVALID_STATE_TRANSITION", state: room.state }
      }

      const questionId = typeof input.payload?.questionId === "string" ? input.payload.questionId : ""
      const selectedQuestion = getQuestionById(session, questionId)
      if (!questionId || !selectedQuestion) {
        return { ok: false, code: "TRIVIA_INVALID_CLUE" }
      }

      const marked = markQuestionUsed(session, questionId)
      if (!marked) {
        return { ok: false, code: "TRIVIA_INVALID_CLUE" }
      }

      session.selectedQuestionId = questionId
      session.questionIndex = session.totalQuestions - getRemainingQuestionCount(session)
      session.currentResponderPlayerId = null
      session.currentResponderTeamId = null
      session.phase = "countdown"
      session.countdownEndsAt = nowMs() + TRIVIA_COUNTDOWN_MS
      session.buzzEndsAt = null
      session.answerEndsAt = null
      session.lastResult = null

      recordRoomEvent(store, room.id, "trivia.clue_selected", {
        hostId: input.actorId,
        questionId: selectedQuestion.id,
        categoryId: selectedQuestion.categoryId,
        categoryName: selectedQuestion.categoryName,
        points: selectedQuestion.points,
        teamId: session.currentTeamId,
        pickerPlayerId: session.currentPickerPlayerId,
        countdownEndsAt: session.countdownEndsAt,
      })
    } else if (input.actionType === "host.nextQuestion") {
      const session = store.triviaByRoom.get(room.id)
      if (!session || session.status !== "in_progress") {
        return { ok: false, code: "TRIVIA_NOT_ACTIVE" }
      }

      if (session.phase === "answer_reveal") {
        moveToNextTurn(store, room, session)
      } else if (
        session.phase === "countdown" ||
        session.phase === "buzzer_open" ||
        session.phase === "answer_active"
      ) {
        const question = getCurrentTriviaQuestion(session)
        if (!question) {
          return { ok: false, code: "TRIVIA_NOT_ACTIVE" }
        }

        setAnswerReveal(store, room.id, session, {
          answeredOption: null,
          correctOption: question.correctOption,
          awardedTeamId: null,
          awardedPoints: 0,
          wasCorrect: false,
          questionId: question.id,
          reason: "host_skip",
        })
      } else {
        return { ok: false, code: "INVALID_STATE_TRANSITION", state: room.state }
      }
    } else if (input.actionType === "host.selectAnotherResponder") {
      const session = store.triviaByRoom.get(room.id)
      if (!session || session.status !== "in_progress") {
        return { ok: false, code: "TRIVIA_NOT_ACTIVE" }
      }

      if (session.phase !== "board_turn" && session.phase !== "answer_active") {
        return { ok: false, code: "INVALID_STATE_TRANSITION", state: room.state }
      }

      const role = session.phase === "board_turn" ? "picker" : "responder"
      const teamId = role === "picker" ? session.currentTeamId : session.currentResponderTeamId
      const previousPlayerId =
        role === "picker" ? session.currentPickerPlayerId : session.currentResponderPlayerId
      if (!teamId) {
        return { ok: false, code: "TRIVIA_NO_ALTERNATE_RESPONDER" }
      }

      const nextPlayerId = pickTeamMemberForRole(store, room.id, teamId, session, role, previousPlayerId)
      if (!nextPlayerId) {
        return { ok: false, code: "TRIVIA_NO_ALTERNATE_RESPONDER" }
      }

      if (role === "picker") {
        session.currentPickerPlayerId = nextPlayerId
        session.picksByPlayer.set(nextPlayerId, (session.picksByPlayer.get(nextPlayerId) ?? 0) + 1)
      } else {
        session.currentResponderPlayerId = nextPlayerId
        session.answerEndsAt = nowMs() + TRIVIA_ANSWER_WINDOW_MS
      }

      const question = getCurrentTriviaQuestion(session)
      recordRoomEvent(store, room.id, "trivia.responder_reselected", {
        hostId: input.actorId,
        questionId: question?.id ?? null,
        teamId,
        phase: session.phase,
        role,
        previousPlayerId,
        nextPlayerId,
      })
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

  if (!isRoomActiveState(room.state)) {
    return { ok: false, code: "ROOM_NOT_ACTIVE", state: room.state }
  }

  if (input.actionType === "player.heartbeat") {
    touchPlayer(input.roomId, input.actorId)
    const event = buildSyntheticAckEvent(room, "player.heartbeat", { playerId: input.actorId })
    return { ok: true, room, event }
  } else if (input.actionType === "player.input") {
    if (room.state !== "game_live") {
      return { ok: false, code: "INVALID_STATE_TRANSITION", state: room.state }
    }

    touchPlayer(input.roomId, input.actorId)

    const session = store.triviaByRoom.get(room.id)
    const isBuzzIntent =
      input.payload?.intent === "buzz" ||
      input.payload?.kind === "buzz" ||
      input.payload?.action === "buzz" ||
      Object.keys(input.payload ?? {}).length === 0
    if (
      isBuzzIntent &&
      session &&
      session.status === "in_progress" &&
      session.phase === "buzzer_open" &&
      !session.currentResponderPlayerId
    ) {
      const responderTeamId = getPlayerTeamId(store, room.id, input.actorId)
      if (!responderTeamId) {
        return { ok: false, code: "INVALID_STATE_TRANSITION", state: room.state }
      }

      session.currentResponderPlayerId = input.actorId
      session.currentResponderTeamId = responderTeamId
      session.phase = "answer_active"
      session.buzzEndsAt = null
      session.answerEndsAt = nowMs() + TRIVIA_ANSWER_WINDOW_MS

      const question = getCurrentTriviaQuestion(session)
      recordRoomEvent(store, room.id, "trivia.buzzer_locked", {
        questionId: question?.id ?? null,
        responderPlayerId: input.actorId,
        responderTeamId,
        answerEndsAt: session.answerEndsAt,
      })
    } else {
      recordRoomEvent(store, room.id, "player.input", {
        playerId: input.actorId,
        payload: input.payload ?? {},
      })
    }
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

    applyTriviaTimedTransitions(store, room, session)

    if (session.phase !== "answer_active") {
      return { ok: false, code: "INVALID_STATE_TRANSITION", state: room.state }
    }

    if (!session.currentResponderPlayerId || session.currentResponderPlayerId !== input.actorId) {
      return { ok: false, code: "TRIVIA_INVALID_RESPONDER" }
    }

    const selectedOption = parseTriviaOption(input.payload?.option)
    if (!selectedOption) {
      return { ok: false, code: "INVALID_OPTION" }
    }

    const question = getCurrentTriviaQuestion(session)
    if (!question || !session.currentResponderTeamId) {
      return { ok: false, code: "TRIVIA_NOT_ACTIVE" }
    }

    touchPlayer(input.roomId, input.actorId)
    session.answersByPlayer.set(input.actorId, (session.answersByPlayer.get(input.actorId) ?? 0) + 1)

    const wasCorrect = selectedOption === question.correctOption
    const scoreDelta = wasCorrect ? question.points : -question.points
    const scoreResult = addTeamScore(store, room.id, session.currentResponderTeamId, scoreDelta)
    if (!scoreResult.ok) {
      return { ok: false, code: scoreResult.code }
    }

    setAnswerReveal(store, room.id, session, {
      answeredOption: selectedOption,
      correctOption: question.correctOption,
      awardedTeamId: session.currentResponderTeamId,
      awardedPoints: scoreDelta,
      wasCorrect,
      questionId: question.id,
      reason: wasCorrect ? "correct" : "wrong",
    })
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

  const triviaSession = store.triviaByRoom.get(roomId) ?? null
  if (triviaSession) {
    applyTriviaTimedTransitions(store, room, triviaSession)
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
    trivia: toTriviaSnapshot(triviaSession),
  }
}

export type ProtocolVersion = "v1"
export type ClientRole = "host" | "player"

export type HostActionType =
  | "host.lockLobby"
  | "host.assignPlayerTeam"
  | "host.startTeams"
  | "host.startGame"
  | "host.startTrivia"
  | "host.nextQuestion"
  | "host.addTeamScore"
  | "host.endSession"
export type PlayerActionType = "player.heartbeat" | "player.input" | "player.submitAnswer"
export type ClientActionType = HostActionType | PlayerActionType

export type ServerEventType = "room.state" | "room.diff" | "room.presence" | "room.error" | "room.ack"

export type JsonRecord = Record<string, unknown>

export type ClientEnvelope = {
  v: ProtocolVersion
  type: ClientActionType
  requestId?: string
  ts?: number
  payload?: JsonRecord
}

export type ServerEnvelope = {
  v: ProtocolVersion
  type: ServerEventType
  requestId?: string
  ts: number
  payload: JsonRecord
}

const HOST_ACTIONS = new Set<HostActionType>([
  "host.lockLobby",
  "host.assignPlayerTeam",
  "host.startTeams",
  "host.startGame",
  "host.startTrivia",
  "host.nextQuestion",
  "host.addTeamScore",
  "host.endSession",
])

const PLAYER_ACTIONS = new Set<PlayerActionType>(["player.heartbeat", "player.input", "player.submitAnswer"])

export function isClientEnvelope(value: unknown): value is ClientEnvelope {
  if (!value || typeof value !== "object") {
    return false
  }

  const candidate = value as Record<string, unknown>
  const version = candidate.v
  const type = candidate.type
  const requestId = candidate.requestId
  const ts = candidate.ts
  const payload = candidate.payload

  if (version !== "v1" || typeof type !== "string") {
    return false
  }

  if (requestId !== undefined && typeof requestId !== "string") {
    return false
  }

  if (ts !== undefined && typeof ts !== "number") {
    return false
  }

  if (payload !== undefined && (!payload || typeof payload !== "object" || Array.isArray(payload))) {
    return false
  }

  return HOST_ACTIONS.has(type as HostActionType) || PLAYER_ACTIONS.has(type as PlayerActionType)
}

export function isActionAllowedForRole(type: ClientActionType, role: ClientRole) {
  if (role === "host") {
    return HOST_ACTIONS.has(type as HostActionType)
  }

  return PLAYER_ACTIONS.has(type as PlayerActionType)
}

export function makeServerEnvelope(type: ServerEventType, payload: JsonRecord, requestId?: string): ServerEnvelope {
  return {
    v: "v1",
    type,
    requestId,
    ts: Date.now(),
    payload,
  }
}

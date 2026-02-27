import type { ClientActionType, ServerEnvelope } from "@/lib/server/protocol-v1"
import type { RoomSnapshot } from "@/lib/server/types"

type ErrorBody = {
  error?: {
    code?: string
    message?: string
    details?: Record<string, unknown>
  }
}

type RequestOptions = {
  method?: "GET" | "POST"
  token?: string
  body?: unknown
  signal?: AbortSignal
}

const RETRYABLE_STATUSES = new Set([429, 502, 503, 504])

export class LiveApiError extends Error {
  status: number
  code: string
  details?: Record<string, unknown>

  constructor(status: number, code: string, message: string, details?: Record<string, unknown>) {
    super(message)
    this.name = "LiveApiError"
    this.status = status
    this.code = code
    this.details = details
  }
}

function safeParseJson<T>(text: string): T | null {
  if (!text) {
    return null
  }

  try {
    return JSON.parse(text) as T
  } catch {
    return null
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

async function requestJson<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: HeadersInit = {
    "content-type": "application/json",
  }

  if (options.token) {
    headers.authorization = `Bearer ${options.token}`
  }

  const method = options.method ?? "GET"
  const isRetryableMethod = method === "GET"
  const maxAttempts = isRetryableMethod ? 3 : 1

  let response: Response | null = null
  let lastFetchError: unknown = null

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      response = await fetch(path, {
        method,
        headers,
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        signal: options.signal,
      })

      if (!RETRYABLE_STATUSES.has(response.status) || attempt === maxAttempts) {
        break
      }
    } catch (error) {
      lastFetchError = error
      if (!isRetryableMethod || attempt === maxAttempts) {
        throw error
      }
    }

    const backoffMs = 140 * 2 ** (attempt - 1) + Math.floor(Math.random() * 80)
    await sleep(backoffMs)
  }

  if (!response) {
    if (lastFetchError instanceof LiveApiError) {
      throw lastFetchError
    }
    throw new LiveApiError(503, "UPSTREAM_UNAVAILABLE", "Unable to reach live API")
  }

  const text = await response.text()
  const json = safeParseJson<T & ErrorBody>(text)

  if (!response.ok) {
    const code = json?.error?.code ?? "UNKNOWN_ERROR"
    const message = json?.error?.message ?? `Request failed with status ${response.status}`
    throw new LiveApiError(response.status, code, message, json?.error?.details)
  }

  if (!json) {
    throw new LiveApiError(response.status, "EMPTY_RESPONSE", "Empty response body")
  }

  return json as T
}

export type HostLoginResult = {
  token: string
  host: {
    id: string
    username: string
  }
}

export type CreateRoomResult = {
  room: RoomSnapshot
  joinUrl: string
  qrPayload: string
}

export type JoinRoomResult = {
  playerToken: string
  player: {
    id: string
    name: string
    avatarType: string
    avatarValue: string | null
  }
  room: RoomSnapshot
}

export type ReconnectResult = {
  room: RoomSnapshot
  player: {
    id: string
    name: string
    avatarType: string
    avatarValue: string | null
  }
}

export type RoomStateResult = ServerEnvelope & {
  payload: {
    room: RoomSnapshot
  }
}

export type RoomDiffEvent = {
  id: string
  seq: number
  roomId: string
  roomVersion: number
  eventType: string
  payload: Record<string, unknown>
  createdAt: number
}

export type RoomEventsResult = ServerEnvelope & {
  payload: {
    roomId: string
    sinceVersion: number
    currentVersion: number
    events: RoomDiffEvent[]
  }
}

export type RoomActionAck = ServerEnvelope & {
  payload: {
    room: RoomSnapshot
    event: RoomDiffEvent
  }
}

export function makeRequestId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID()
  }

  return `req-${Date.now()}-${Math.floor(Math.random() * 100000)}`
}

export function hostLogin(username: string, password: string) {
  return requestJson<HostLoginResult>("/api/auth/host/login", {
    method: "POST",
    body: { username, password },
  })
}

export function createRoom(hostToken: string) {
  return requestJson<CreateRoomResult>("/api/rooms/create", {
    method: "POST",
    token: hostToken,
  })
}

export function joinRoom(roomId: string, name: string, avatarEmoji?: string) {
  return requestJson<JoinRoomResult>(`/api/rooms/${roomId}/join`, {
    method: "POST",
    body: {
      name,
      ...(avatarEmoji ? { avatarEmoji } : {}),
    },
  })
}

export function reconnectPlayer(roomId: string, playerToken: string) {
  return requestJson<ReconnectResult>(`/api/rooms/${roomId}/reconnect`, {
    method: "POST",
    token: playerToken,
  })
}

export function getRoomState(roomId: string, token: string, signal?: AbortSignal) {
  return requestJson<RoomStateResult>(`/api/rooms/${roomId}/state`, {
    token,
    signal,
  })
}

export function getRoomEvents(roomId: string, token: string, sinceVersion: number, limit = 50) {
  const params = new URLSearchParams({
    since: String(sinceVersion),
    limit: String(limit),
  })
  return requestJson<RoomEventsResult>(`/api/rooms/${roomId}/events?${params.toString()}`, {
    token,
  })
}

export function sendAction(
  roomId: string,
  token: string,
  type: ClientActionType,
  payload?: Record<string, unknown>,
  requestId?: string
) {
  return requestJson<RoomActionAck>(`/api/rooms/${roomId}/actions`, {
    method: "POST",
    token,
    body: {
      v: "v1",
      type,
      requestId: requestId ?? makeRequestId(),
      payload: payload ?? {},
    },
  })
}

export function endRoom(roomId: string, hostToken: string) {
  return requestJson<{ room: RoomSnapshot }>(`/api/rooms/${roomId}/end`, {
    method: "POST",
    token: hostToken,
  })
}

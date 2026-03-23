import { errorResponse, jsonResponse, safeJson } from "@/lib/server/http"
import { isActionAllowedForRole, isClientEnvelope, makeServerEnvelope } from "@/lib/server/protocol-v1"
import { resolveRoomActor } from "@/lib/server/room-auth"
import { applyRoomAction, buildRoomSnapshot } from "@/lib/server/store"
import { retryWithFreshRoomShard, withRoomScopedStore, withRoomShardStore } from "@/lib/server/store-sync"

export const runtime = "nodejs"

type RouteContext = {
  params: Promise<{ roomId: string }>
}

const HOST_REQUEST_ID_REQUIRED_ACTIONS = new Set([
  "host.resumeSession",
  "host.lockLobby",
  "host.assignPlayerTeam",
  "host.renameTeam",
  "host.selectAnotherResponder",
  "host.startTeams",
  "host.startGame",
  "host.startTrivia",
  "host.switchGame",
  "host.startHaraj",
  "host.startHarajRound",
  "host.nextHarajRound",
  "host.selectTriviaClue",
  "host.nextQuestion",
  "host.addTeamScore",
  "host.endSession",
])

const HOST_RATE_LIMIT_WINDOW_MS = 5000
const DEFAULT_HOST_ACTION_RATE_LIMIT = 120
const HOST_RATE_LIMIT_ENTRY_TTL_MS = 5 * 60 * 1000
const HOST_RATE_LIMIT_SWEEP_INTERVAL = 200
const RETRYABLE_ACTION_SHARD_CODES = new Set(["ROOM_NOT_FOUND", "ROOM_NOT_ACTIVE", "PLAYER_NOT_FOUND", "HOST_ROOM_MISMATCH"])

type GlobalWithHostRateLimit = typeof globalThis & {
  __hroofHostActionRateLimitByRoom?: Map<string, number[]>
  __hroofHostActionRateLimitCalls?: number
}

function getHostRateLimitStore() {
  const globalWithRateLimit = globalThis as GlobalWithHostRateLimit
  if (!globalWithRateLimit.__hroofHostActionRateLimitByRoom) {
    globalWithRateLimit.__hroofHostActionRateLimitByRoom = new Map<string, number[]>()
  }
  return globalWithRateLimit.__hroofHostActionRateLimitByRoom
}

function parsePositiveInt(raw: string | undefined, fallback: number) {
  if (!raw) {
    return fallback
  }

  const parsed = Number.parseInt(raw, 10)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback
  }

  return parsed
}

function maybeSweepHostRateLimitStore(now: number, store: Map<string, number[]>) {
  const globalWithRateLimit = globalThis as GlobalWithHostRateLimit
  const nextCalls = (globalWithRateLimit.__hroofHostActionRateLimitCalls ?? 0) + 1
  globalWithRateLimit.__hroofHostActionRateLimitCalls = nextCalls
  if (nextCalls % HOST_RATE_LIMIT_SWEEP_INTERVAL !== 0) {
    return
  }

  const staleCutoff = now - HOST_RATE_LIMIT_ENTRY_TTL_MS
  for (const [roomId, timestamps] of store.entries()) {
    const latestTimestamp = timestamps.length > 0 ? timestamps[timestamps.length - 1] ?? 0 : 0
    if (latestTimestamp < staleCutoff) {
      store.delete(roomId)
    }
  }
}

function consumeHostActionQuota(roomId: string) {
  const limit = parsePositiveInt(process.env.HROOF_HOST_ACTIONS_PER_5S, DEFAULT_HOST_ACTION_RATE_LIMIT)
  const store = getHostRateLimitStore()
  const now = Date.now()
  maybeSweepHostRateLimitStore(now, store)
  const cutoff = now - HOST_RATE_LIMIT_WINDOW_MS
  const timestamps = store.get(roomId) ?? []
  const active = timestamps.filter((value) => value > cutoff)

  if (active.length >= limit) {
    store.set(roomId, active)
    return false
  }

  active.push(now)
  store.set(roomId, active)
  return true
}

export async function POST(request: Request, context: RouteContext) {
  const { roomId } = await context.params
  if (!roomId) {
    return errorResponse(400, "VALIDATION_ERROR", "roomId is required")
  }

  const actor = await resolveRoomActor(request, roomId)
  if (!actor.ok) {
    return errorResponse(actor.status, actor.code, actor.message)
  }

  const rawBody = await safeJson<unknown>(request)
  if (!rawBody || !isClientEnvelope(rawBody)) {
    return errorResponse(400, "INVALID_PROTOCOL_ENVELOPE", "Body must follow protocol v1 envelope")
  }

  if (!isActionAllowedForRole(rawBody.type, actor.actor.role)) {
    return errorResponse(403, "ACTION_FORBIDDEN", "Action is not allowed for this actor role")
  }

  if (actor.actor.role === "host") {
    if (HOST_REQUEST_ID_REQUIRED_ACTIONS.has(rawBody.type) && !rawBody.requestId) {
      return errorResponse(
        400,
        "MISSING_REQUEST_ID",
        "requestId is required for host commands to enforce idempotency"
      )
    }

    if (rawBody.type !== "host.heartbeat" && !consumeHostActionQuota(roomId)) {
      return errorResponse(429, "HOST_ACTION_RATE_LIMITED", "Too many host actions for this room")
    }
  }

  // `host.endSession` updates host-global active room ownership, so it needs global + room sync.
  const syncOperation = rawBody.type === "host.endSession" ? withRoomScopedStore : withRoomShardStore

  return syncOperation(roomId, async () => {
    const applied = await retryWithFreshRoomShard(
      roomId,
      () =>
        applyRoomAction({
          roomId,
          actorRole: actor.actor.role,
          actorId: actor.actor.actorId,
          actionType: rawBody.type,
          requestId: rawBody.requestId,
          payload: rawBody.payload,
        }),
      (result) => !result.ok && RETRYABLE_ACTION_SHARD_CODES.has(result.code)
    )

    if (!applied.ok) {
      if (applied.code === "ROOM_NOT_FOUND") {
        return errorResponse(404, "ROOM_NOT_FOUND", "Room not found")
      }

      if (applied.code === "ROOM_NOT_ACTIVE") {
        return errorResponse(409, "ROOM_NOT_ACTIVE", "Room is no longer active", {
          state: applied.state,
        })
      }

      if (applied.code === "PLAYER_NOT_FOUND") {
        return errorResponse(404, "PLAYER_NOT_FOUND", "Player not found in this room")
      }

      if (applied.code === "HOST_ROOM_MISMATCH") {
        return errorResponse(403, "HOST_ROOM_MISMATCH", "Room does not belong to host")
      }

      if (applied.code === "INVALID_STATE_TRANSITION") {
        return errorResponse(409, "INVALID_STATE_TRANSITION", "Action is invalid for current room state", {
          state: applied.state,
        })
      }

      if (applied.code === "TEAM_NOT_FOUND") {
        return errorResponse(404, "TEAM_NOT_FOUND", "Target team was not found")
      }

      if (applied.code === "INVALID_TEAM_ASSIGNMENT") {
        return errorResponse(400, "INVALID_TEAM_ASSIGNMENT", "playerId and teamId are required")
      }

      if (applied.code === "INVALID_TEAM_NAME") {
        return errorResponse(400, "INVALID_TEAM_NAME", "Team name must be between 1 and 24 characters")
      }

      if (applied.code === "INVALID_DELTA") {
        return errorResponse(400, "INVALID_DELTA", "Score delta must be a non-zero number")
      }

      if (applied.code === "TRIVIA_NOT_ACTIVE") {
        return errorResponse(409, "TRIVIA_NOT_ACTIVE", "Trivia session is not active")
      }

      if (applied.code === "TRIVIA_INVALID_CLUE") {
        return errorResponse(400, "TRIVIA_INVALID_CLUE", "Selected clue is invalid or already used")
      }

      if (applied.code === "TRIVIA_NO_ALTERNATE_RESPONDER") {
        return errorResponse(
          409,
          "TRIVIA_NO_ALTERNATE_RESPONDER",
          "No alternate responder is available in the active team"
        )
      }

      if (applied.code === "TRIVIA_INVALID_RESPONDER") {
        return errorResponse(403, "TRIVIA_INVALID_RESPONDER", "Only the selected responder can answer")
      }

      if (applied.code === "HARAJ_NOT_ACTIVE") {
        return errorResponse(409, "HARAJ_NOT_ACTIVE", "Haraj session is not active")
      }

      if (applied.code === "HARAJ_INVALID_ESTIMATE") {
        return errorResponse(400, "HARAJ_INVALID_ESTIMATE", "Estimate must be a valid non-negative number")
      }

      if (applied.code === "HARAJ_ALREADY_SUBMITTED") {
        return errorResponse(409, "HARAJ_ALREADY_SUBMITTED", "Player already submitted an estimate for this round")
      }

      if (applied.code === "INVALID_OPTION") {
        return errorResponse(400, "INVALID_OPTION", "Answer option must be one of A, B, C, or D")
      }

      return errorResponse(400, "ACTION_NOT_SUPPORTED", "Action type is not supported")
    }

    const snapshot = buildRoomSnapshot(roomId)
    if (!snapshot) {
      return errorResponse(500, "ROOM_SNAPSHOT_FAILED", "Unable to build room snapshot")
    }

    const envelope = makeServerEnvelope(
      "room.ack",
      {
        room: snapshot,
        event: applied.event,
      },
      rawBody.requestId
    )

    return jsonResponse(200, envelope)
  })
}

import { errorResponse } from "@/lib/server/http"
import { makeServerEnvelope } from "@/lib/server/protocol-v1"
import { resolveRoomActor, type RoomActor } from "@/lib/server/room-auth"
import { buildRoomSnapshot, getPlayerInRoom, getRoom, isRoomActiveState, subscribeRoomEvents } from "@/lib/server/store"
import { retryWithFreshRoomShard, withRoomShardStore } from "@/lib/server/store-sync"
import type { RoomSnapshot } from "@/lib/server/types"

export const runtime = "nodejs"

const STREAM_POLL_IDLE_MS = 1000
const STREAM_POLL_BOARD_MS = 500
const STREAM_POLL_ACTIVE_MS = 250
const STREAM_KEEPALIVE_MS = 15000
const STREAM_PLAYER_NOT_FOUND_MISS_THRESHOLD = 5

type RouteContext = {
  params: Promise<{ roomId: string }>
}

type SnapshotReadResult =
  | { ok: true; snapshot: RoomSnapshot }
  | { ok: false; status: number; code: string; message: string; details?: Record<string, unknown> }

type StreamSubscriber = {
  id: string
  actor: RoomActor
  playerMissingCount: number
  onState: (snapshot: RoomSnapshot) => void
  onError: (error: {
    status: number
    code: string
    message: string
    details?: Record<string, unknown>
  }) => void
}

type RoomStreamHub = {
  roomId: string
  subscribers: Map<string, StreamSubscriber>
  pollTimer: ReturnType<typeof setTimeout> | null
  inFlight: boolean
  lastVersion: number
  currentSnapshot: RoomSnapshot | null
  unsubscribeStoreEvents: (() => void) | null
}

type GlobalWithRoomHubs = typeof globalThis & {
  __hroofRoomStreamHubs?: Map<string, RoomStreamHub>
}

function resolveStreamPollMs(snapshot: RoomSnapshot | null) {
  if (!snapshot) {
    return STREAM_POLL_IDLE_MS
  }

  if (snapshot.state !== "game_live") {
    return STREAM_POLL_IDLE_MS
  }

  if (snapshot.activeGame === "trivia" && snapshot.trivia.status === "in_progress") {
    if (snapshot.trivia.phase === "board_turn") {
      return STREAM_POLL_BOARD_MS
    }
    return STREAM_POLL_ACTIVE_MS
  }

  if (snapshot.activeGame === "haraj" && snapshot.haraj.status === "in_progress") {
    if (snapshot.haraj.phase === "haraj_collecting" || snapshot.haraj.phase === "haraj_reveal") {
      return STREAM_POLL_ACTIVE_MS
    }
    return STREAM_POLL_BOARD_MS
  }

  if (snapshot.trivia.status === "in_progress") {
    if (snapshot.trivia.phase === "board_turn") {
      return STREAM_POLL_BOARD_MS
    }
    return STREAM_POLL_ACTIVE_MS
  }

  if (snapshot.haraj.status === "in_progress") {
    if (snapshot.haraj.phase === "haraj_collecting" || snapshot.haraj.phase === "haraj_reveal") {
      return STREAM_POLL_ACTIVE_MS
    }
    return STREAM_POLL_BOARD_MS
  }

  return STREAM_POLL_IDLE_MS
}

function authorizeSnapshotForSubscriber(
  snapshot: RoomSnapshot,
  actor: RoomActor
):
  | { ok: true }
  | { ok: false; status: number; code: string; message: string; details?: Record<string, unknown> } {
  if (actor.role === "host") {
    if (snapshot.hostId !== actor.actorId) {
      return {
        ok: false,
        status: 403,
        code: "HOST_ROOM_MISMATCH",
        message: "Room does not belong to host",
      }
    }

    return { ok: true }
  }

  if (!isRoomActiveState(snapshot.state)) {
    return {
      ok: false,
      status: 409,
      code: "ROOM_NOT_ACTIVE",
      message: "Room is no longer active",
      details: { state: snapshot.state },
    }
  }

  const playerExists = snapshot.players.some((player) => player.playerId === actor.actorId)
  if (!playerExists) {
    return {
      ok: false,
      status: 404,
      code: "PLAYER_NOT_FOUND",
      message: "Player not found in this room",
    }
  }

  return { ok: true }
}

async function readAuthorizedSnapshot(roomId: string, actor: RoomActor): Promise<SnapshotReadResult> {
  return withRoomShardStore(roomId, async () => {
    return retryWithFreshRoomShard(
      roomId,
      () => {
        const room = getRoom(roomId)
        if (!room) {
          return { ok: false as const, status: 404, code: "ROOM_NOT_FOUND" as const, message: "Room not found" }
        }

        if (actor.role === "host" && room.hostId !== actor.actorId) {
          return {
            ok: false as const,
            status: 403,
            code: "HOST_ROOM_MISMATCH" as const,
            message: "Room does not belong to host",
          }
        }

        if (actor.role === "player") {
          if (!isRoomActiveState(room.state)) {
            return {
              ok: false as const,
              status: 409,
              code: "ROOM_NOT_ACTIVE" as const,
              message: "Room is no longer active",
              details: { state: room.state },
            }
          }

          const player = getPlayerInRoom(roomId, actor.actorId)
          if (!player) {
            return {
              ok: false as const,
              status: 404,
              code: "PLAYER_NOT_FOUND" as const,
              message: "Player not found in this room",
            }
          }
        }

        const snapshot = buildRoomSnapshot(roomId)
        if (!snapshot) {
          return {
            ok: false as const,
            status: 500,
            code: "ROOM_SNAPSHOT_FAILED" as const,
            message: "Unable to build room snapshot",
          }
        }

        return { ok: true as const, snapshot }
      },
      (result) =>
        !result.ok &&
        (result.code === "ROOM_NOT_FOUND" ||
          result.code === "HOST_ROOM_MISMATCH" ||
          result.code === "ROOM_NOT_ACTIVE" ||
          result.code === "PLAYER_NOT_FOUND")
    )
  })
}

async function readSnapshotForBroadcast(roomId: string): Promise<SnapshotReadResult> {
  return withRoomShardStore(roomId, async () => {
    return retryWithFreshRoomShard(
      roomId,
      () => {
        const room = getRoom(roomId)
        if (!room) {
          return { ok: false as const, status: 404, code: "ROOM_NOT_FOUND" as const, message: "Room not found" }
        }

        const snapshot = buildRoomSnapshot(roomId)
        if (!snapshot) {
          return {
            ok: false as const,
            status: 500,
            code: "ROOM_SNAPSHOT_FAILED" as const,
            message: "Unable to build room snapshot",
          }
        }

        return { ok: true as const, snapshot }
      },
      (result) => !result.ok && result.code === "ROOM_NOT_FOUND"
    )
  })
}

function getRoomStreamHubs() {
  const globalWithHubs = globalThis as GlobalWithRoomHubs
  if (!globalWithHubs.__hroofRoomStreamHubs) {
    globalWithHubs.__hroofRoomStreamHubs = new Map<string, RoomStreamHub>()
  }
  return globalWithHubs.__hroofRoomStreamHubs
}

function ensureRoomStreamHub(roomId: string, seedSnapshot: RoomSnapshot): RoomStreamHub {
  const hubs = getRoomStreamHubs()
  const existing = hubs.get(roomId)
  if (existing) {
    if (!existing.currentSnapshot || existing.lastVersion < seedSnapshot.version) {
      existing.currentSnapshot = seedSnapshot
      existing.lastVersion = seedSnapshot.version
    }
    return existing
  }

  const created: RoomStreamHub = {
    roomId,
    subscribers: new Map<string, StreamSubscriber>(),
    pollTimer: null,
    inFlight: false,
    lastVersion: seedSnapshot.version,
    currentSnapshot: seedSnapshot,
    unsubscribeStoreEvents: null,
  }
  created.unsubscribeStoreEvents = subscribeRoomEvents(roomId, () => {
    scheduleHubPoll(created, 0)
  })
  hubs.set(roomId, created)
  return created
}

function removeRoomStreamHubIfIdle(roomId: string) {
  const hubs = getRoomStreamHubs()
  const hub = hubs.get(roomId)
  if (!hub) {
    return
  }

  if (hub.subscribers.size > 0) {
    return
  }

  if (hub.pollTimer) {
    clearTimeout(hub.pollTimer)
    hub.pollTimer = null
  }
  if (hub.unsubscribeStoreEvents) {
    hub.unsubscribeStoreEvents()
    hub.unsubscribeStoreEvents = null
  }

  hubs.delete(roomId)
}

function fanOutSnapshot(hub: RoomStreamHub, snapshot: RoomSnapshot) {
  const subscribers = [...hub.subscribers.values()]
  for (const subscriber of subscribers) {
    const authorized = authorizeSnapshotForSubscriber(snapshot, subscriber.actor)
    if (!authorized.ok) {
      // A player may be temporarily missing from a stale shard snapshot on this process.
      // Require repeated misses before force-closing the stream subscriber.
      if (authorized.code === "PLAYER_NOT_FOUND" && subscriber.actor.role === "player") {
        subscriber.playerMissingCount += 1
        if (subscriber.playerMissingCount < STREAM_PLAYER_NOT_FOUND_MISS_THRESHOLD) {
          continue
        }
      }

      try {
        subscriber.onError(authorized)
      } catch {
        // noop: subscriber will be dropped either way.
      }
      hub.subscribers.delete(subscriber.id)
      continue
    }

    subscriber.playerMissingCount = 0

    try {
      subscriber.onState(snapshot)
    } catch {
      hub.subscribers.delete(subscriber.id)
    }
  }
}

function fanOutErrorAndClose(hub: RoomStreamHub, error: {
  status: number
  code: string
  message: string
  details?: Record<string, unknown>
}) {
  const subscribers = [...hub.subscribers.values()]
  for (const subscriber of subscribers) {
    try {
      subscriber.onError(error)
    } catch {
      // noop: best-effort error fanout.
    }
  }
  hub.subscribers.clear()
  removeRoomStreamHubIfIdle(hub.roomId)
}

function scheduleHubPoll(hub: RoomStreamHub, delayMs: number) {
  if (hub.pollTimer) {
    return
  }

  hub.pollTimer = setTimeout(async () => {
    hub.pollTimer = null

    if (hub.subscribers.size === 0) {
      removeRoomStreamHubIfIdle(hub.roomId)
      return
    }

    if (hub.inFlight) {
      scheduleHubPoll(hub, resolveStreamPollMs(hub.currentSnapshot))
      return
    }

    hub.inFlight = true
    try {
      const snapshotResult = await readSnapshotForBroadcast(hub.roomId)
      if (!snapshotResult.ok) {
        fanOutErrorAndClose(hub, snapshotResult)
        return
      }

      const nextSnapshot = snapshotResult.snapshot
      if (!hub.currentSnapshot || nextSnapshot.version !== hub.lastVersion) {
        hub.currentSnapshot = nextSnapshot
        hub.lastVersion = nextSnapshot.version
        fanOutSnapshot(hub, nextSnapshot)
      }
    } finally {
      hub.inFlight = false
    }

    if (hub.subscribers.size > 0) {
      scheduleHubPoll(hub, resolveStreamPollMs(hub.currentSnapshot))
    } else {
      removeRoomStreamHubIfIdle(hub.roomId)
    }
  }, delayMs)
}

function subscribeRoomStreamHub(roomId: string, seedSnapshot: RoomSnapshot, subscriber: StreamSubscriber) {
  const hub = ensureRoomStreamHub(roomId, seedSnapshot)
  hub.subscribers.set(subscriber.id, subscriber)

  if (hub.currentSnapshot && hub.currentSnapshot.version >= seedSnapshot.version) {
    const authorized = authorizeSnapshotForSubscriber(hub.currentSnapshot, subscriber.actor)
    if (authorized.ok) {
      subscriber.onState(hub.currentSnapshot)
    } else {
      subscriber.onError(authorized)
      hub.subscribers.delete(subscriber.id)
      removeRoomStreamHubIfIdle(roomId)
      return () => {}
    }
  }

  scheduleHubPoll(hub, resolveStreamPollMs(hub.currentSnapshot))

  return () => {
    const hubs = getRoomStreamHubs()
    const currentHub = hubs.get(roomId)
    if (!currentHub) {
      return
    }
    currentHub.subscribers.delete(subscriber.id)
    removeRoomStreamHubIfIdle(roomId)
  }
}

function encodeSseEvent(event: string, payload: unknown) {
  return `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`
}

export async function GET(request: Request, context: RouteContext) {
  const { roomId } = await context.params
  if (!roomId) {
    return errorResponse(400, "VALIDATION_ERROR", "roomId is required")
  }

  const actor = await resolveRoomActor(request, roomId)
  if (!actor.ok) {
    return errorResponse(actor.status, actor.code, actor.message)
  }

  const initialSnapshot = await readAuthorizedSnapshot(roomId, actor.actor)
  if (!initialSnapshot.ok) {
    return errorResponse(initialSnapshot.status, initialSnapshot.code, initialSnapshot.message, initialSnapshot.details)
  }

  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false
      let keepAliveTimer: ReturnType<typeof setInterval> | null = null
      let unsubscribe: (() => void) | null = null
      let lastSentVersion = initialSnapshot.snapshot.version

      const enqueueChunk = (chunk: string) => {
        if (closed) {
          return false
        }

        try {
          controller.enqueue(encoder.encode(chunk))
          return true
        } catch {
          cleanup()
          return false
        }
      }

      const cleanup = () => {
        if (closed) {
          return
        }

        closed = true
        if (unsubscribe) {
          unsubscribe()
          unsubscribe = null
        }
        if (keepAliveTimer) {
          clearInterval(keepAliveTimer)
        }
        request.signal.removeEventListener("abort", cleanup)
        try {
          controller.close()
        } catch {
          // Stream may already be closed by runtime.
        }
      }

      const sendState = (snapshot: RoomSnapshot) => {
        lastSentVersion = snapshot.version
        const envelope = makeServerEnvelope("room.state", { room: snapshot })
        enqueueChunk(encodeSseEvent("room.state", envelope))
      }

      const sendErrorAndClose = (error: {
        status: number
        code: string
        message: string
        details?: Record<string, unknown>
      }) => {
        enqueueChunk(
          encodeSseEvent("room.error", {
            error: {
              code: error.code,
              message: error.message,
              ...(error.details ? { details: error.details } : {}),
            },
          })
        )
        cleanup()
      }

      sendState(initialSnapshot.snapshot)

      const subscriberId = `stream_${Date.now()}_${Math.random().toString(36).slice(2)}`
      unsubscribe = subscribeRoomStreamHub(roomId, initialSnapshot.snapshot, {
        id: subscriberId,
        actor: actor.actor,
        playerMissingCount: 0,
        onState: (snapshot) => {
          if (closed) {
            return
          }
          if (snapshot.version <= lastSentVersion) {
            return
          }
          sendState(snapshot)
        },
        onError: sendErrorAndClose,
      })

      keepAliveTimer = setInterval(() => {
        if (closed) {
          return
        }
        enqueueChunk(`: ping ${Date.now()}\n\n`)
      }, STREAM_KEEPALIVE_MS)

      request.signal.addEventListener("abort", cleanup)
    },
    cancel() {
      // client disconnected
    },
  })

  return new Response(stream, {
    status: 200,
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-store, no-cache, must-revalidate, max-age=0",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    },
  })
}

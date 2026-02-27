import { errorResponse } from "@/lib/server/http"
import { makeServerEnvelope } from "@/lib/server/protocol-v1"
import { resolveRoomActor, type RoomActor } from "@/lib/server/room-auth"
import { buildRoomSnapshot, getPlayerInRoom, getRoom, isRoomActiveState } from "@/lib/server/store"
import { withSharedStore } from "@/lib/server/store-sync"
import type { RoomSnapshot } from "@/lib/server/types"

export const runtime = "nodejs"

const STREAM_TICK_MS = 180
const STREAM_KEEPALIVE_MS = 15000

type RouteContext = {
  params: Promise<{ roomId: string }>
}

type SnapshotReadResult =
  | { ok: true; snapshot: RoomSnapshot }
  | { ok: false; status: number; code: string; message: string; details?: Record<string, unknown> }

async function readAuthorizedSnapshot(roomId: string, actor: RoomActor): Promise<SnapshotReadResult> {
  return withSharedStore(async () => {
    const room = getRoom(roomId)
    if (!room) {
      return { ok: false, status: 404, code: "ROOM_NOT_FOUND", message: "Room not found" }
    }

    if (actor.role === "host" && room.hostId !== actor.actorId) {
      return { ok: false, status: 403, code: "HOST_ROOM_MISMATCH", message: "Room does not belong to host" }
    }

    if (actor.role === "player") {
      if (!isRoomActiveState(room.state)) {
        return {
          ok: false,
          status: 409,
          code: "ROOM_NOT_ACTIVE",
          message: "Room is no longer active",
          details: { state: room.state },
        }
      }

      const player = getPlayerInRoom(roomId, actor.actorId)
      if (!player) {
        return { ok: false, status: 404, code: "PLAYER_NOT_FOUND", message: "Player not found in this room" }
      }
    }

    const snapshot = buildRoomSnapshot(roomId)
    if (!snapshot) {
      return { ok: false, status: 500, code: "ROOM_SNAPSHOT_FAILED", message: "Unable to build room snapshot" }
    }

    return { ok: true, snapshot }
  })
}

function encodeSseEvent(event: string, payload: unknown) {
  return `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`
}

export async function GET(request: Request, context: RouteContext) {
  const { roomId } = await context.params
  if (!roomId) {
    return errorResponse(400, "VALIDATION_ERROR", "roomId is required")
  }

  const actor = resolveRoomActor(request, roomId)
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
      let pollTimer: ReturnType<typeof setTimeout> | null = null
      let keepAliveTimer: ReturnType<typeof setInterval> | null = null
      let lastVersion = initialSnapshot.snapshot.version

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
        if (pollTimer) {
          clearTimeout(pollTimer)
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

      const schedulePoll = (delayMs: number) => {
        pollTimer = setTimeout(async () => {
          if (closed) {
            return
          }

          const nextSnapshot = await readAuthorizedSnapshot(roomId, actor.actor)
          if (!nextSnapshot.ok) {
            sendErrorAndClose(nextSnapshot)
            return
          }

          if (nextSnapshot.snapshot.version !== lastVersion) {
            lastVersion = nextSnapshot.snapshot.version
            sendState(nextSnapshot.snapshot)
          }

          if (!closed) {
            schedulePoll(STREAM_TICK_MS)
          }
        }, delayMs)
      }

      sendState(initialSnapshot.snapshot)
      schedulePoll(STREAM_TICK_MS)

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

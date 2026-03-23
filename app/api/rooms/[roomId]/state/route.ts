import { errorResponse, jsonResponse } from "@/lib/server/http"
import { makeServerEnvelope } from "@/lib/server/protocol-v1"
import { resolveRoomActor } from "@/lib/server/room-auth"
import { buildRoomSnapshot, getPlayerInRoom, getRoom, isRoomActiveState } from "@/lib/server/store"
import { retryWithFreshRoomShard, withRoomShardStore } from "@/lib/server/store-sync"

export const runtime = "nodejs"

type RouteContext = {
  params: Promise<{ roomId: string }>
}

export async function GET(request: Request, context: RouteContext) {
  const { roomId } = await context.params
  if (!roomId) {
    return errorResponse(400, "VALIDATION_ERROR", "roomId is required")
  }

  return withRoomShardStore(roomId, async () => {
    const actor = await resolveRoomActor(request, roomId)
    if (!actor.ok) {
      return errorResponse(actor.status, actor.code, actor.message)
    }

    const stateRead = await retryWithFreshRoomShard(
      roomId,
      () => {
        const room = getRoom(roomId)
        if (!room) {
          return { ok: false as const, status: 404, code: "ROOM_NOT_FOUND" as const, message: "Room not found" }
        }

        if (actor.actor.role === "host" && room.hostId !== actor.actor.actorId) {
          return {
            ok: false as const,
            status: 403,
            code: "HOST_ROOM_MISMATCH" as const,
            message: "Room does not belong to host",
          }
        }

        if (actor.actor.role === "player") {
          if (!isRoomActiveState(room.state)) {
            return {
              ok: false as const,
              status: 409,
              code: "ROOM_NOT_ACTIVE" as const,
              message: "Room is no longer active",
              details: { state: room.state },
            }
          }

          const player = getPlayerInRoom(roomId, actor.actor.actorId)
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
    if (!stateRead.ok) {
      return errorResponse(stateRead.status, stateRead.code, stateRead.message, stateRead.details)
    }

    return jsonResponse(200, makeServerEnvelope("room.state", { room: stateRead.snapshot }))
  })
}

import { errorResponse, jsonResponse } from "@/lib/server/http"
import { makeServerEnvelope } from "@/lib/server/protocol-v1"
import { resolveRoomActor } from "@/lib/server/room-auth"
import { buildRoomSnapshot, getPlayerInRoom, getRoom, isRoomActiveState } from "@/lib/server/store"
import { withRoomShardStore } from "@/lib/server/store-sync"

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
    const actor = resolveRoomActor(request, roomId)
    if (!actor.ok) {
      return errorResponse(actor.status, actor.code, actor.message)
    }

    const room = getRoom(roomId)
    if (!room) {
      return errorResponse(404, "ROOM_NOT_FOUND", "Room not found")
    }

    if (actor.actor.role === "host" && room.hostId !== actor.actor.actorId) {
      return errorResponse(403, "HOST_ROOM_MISMATCH", "Room does not belong to host")
    }

    if (actor.actor.role === "player") {
      if (!isRoomActiveState(room.state)) {
        return errorResponse(409, "ROOM_NOT_ACTIVE", "Room is no longer active", { state: room.state })
      }

      const player = getPlayerInRoom(roomId, actor.actor.actorId)
      if (!player) {
        return errorResponse(404, "PLAYER_NOT_FOUND", "Player not found in this room")
      }
    }

    const snapshot = buildRoomSnapshot(roomId)
    if (!snapshot) {
      return errorResponse(500, "ROOM_SNAPSHOT_FAILED", "Unable to build room snapshot")
    }

    return jsonResponse(200, makeServerEnvelope("room.state", { room: snapshot }))
  })
}

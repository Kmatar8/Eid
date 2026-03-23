import { buildRoomSnapshot, getPlayerInRoom, getRoom, isRoomActiveState, touchPlayer } from "@/lib/server/store"
import { errorResponse, getBearerToken, jsonResponse } from "@/lib/server/http"
import { retryWithFreshRoomShard, withRoomShardStore } from "@/lib/server/store-sync"
import { isPlayerToken, verifyToken } from "@/lib/server/token"

export const runtime = "nodejs"

type RouteContext = {
  params: Promise<{ roomId: string }>
}

export async function POST(request: Request, context: RouteContext) {
  const { roomId } = await context.params
  if (!roomId) {
    return errorResponse(400, "VALIDATION_ERROR", "roomId is required")
  }

  return withRoomShardStore(roomId, async () => {
    const bearer = getBearerToken(request)
    if (!bearer) {
      return errorResponse(401, "UNAUTHORIZED", "Missing bearer token")
    }

    const claims = verifyToken(bearer)
    if (!isPlayerToken(claims)) {
      return errorResponse(401, "UNAUTHORIZED", "Invalid player token")
    }

    if (claims.roomId !== roomId) {
      return errorResponse(403, "ROOM_TOKEN_MISMATCH", "Token does not belong to this room")
    }

    const reconnectState = await retryWithFreshRoomShard(
      roomId,
      () => {
        const room = getRoom(roomId)
        if (!room) {
          return { ok: false as const, status: 404, code: "ROOM_NOT_FOUND" as const, message: "Room not found" }
        }

        if (!isRoomActiveState(room.state)) {
          return {
            ok: false as const,
            status: 409,
            code: "ROOM_NOT_ACTIVE" as const,
            message: "Room is no longer active",
          }
        }

        const player = getPlayerInRoom(roomId, claims.playerId)
        if (!player) {
          return {
            ok: false as const,
            status: 404,
            code: "PLAYER_NOT_FOUND" as const,
            message: "Player not found in this room",
          }
        }

        return { ok: true as const, player }
      },
      (result) =>
        !result.ok &&
        (result.code === "ROOM_NOT_FOUND" || result.code === "ROOM_NOT_ACTIVE" || result.code === "PLAYER_NOT_FOUND")
    )
    if (!reconnectState.ok) {
      return errorResponse(reconnectState.status, reconnectState.code, reconnectState.message)
    }

    touchPlayer(roomId, reconnectState.player.id)

    const snapshot = buildRoomSnapshot(roomId)
    if (!snapshot) {
      return errorResponse(500, "ROOM_SNAPSHOT_FAILED", "Unable to build room snapshot")
    }

    return jsonResponse(200, {
      room: snapshot,
      player: {
        id: reconnectState.player.id,
        name: reconnectState.player.displayName,
        avatarType: reconnectState.player.avatarType,
        avatarValue: reconnectState.player.avatarValue,
      },
    })
  })
}

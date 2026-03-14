import { buildRoomSnapshot, getPlayerInRoom, getRoom, isRoomActiveState, touchPlayer } from "@/lib/server/store"
import { errorResponse, getBearerToken, jsonResponse } from "@/lib/server/http"
import { hydrateRoomShardFromDurable, withRoomShardStore } from "@/lib/server/store-sync"
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

    let room = getRoom(roomId)
    if (!room) {
      await hydrateRoomShardFromDurable(roomId, { force: true })
      room = getRoom(roomId)
    }
    if (!room) {
      return errorResponse(404, "ROOM_NOT_FOUND", "Room not found")
    }

    if (!isRoomActiveState(room.state)) {
      return errorResponse(409, "ROOM_NOT_ACTIVE", "Room is no longer active")
    }

    let player = getPlayerInRoom(roomId, claims.playerId)
    if (!player) {
      await hydrateRoomShardFromDurable(roomId, { force: true })
      room = getRoom(roomId) ?? room
      if (!isRoomActiveState(room.state)) {
        return errorResponse(409, "ROOM_NOT_ACTIVE", "Room is no longer active")
      }
      player = getPlayerInRoom(roomId, claims.playerId)
    }
    if (!player) {
      return errorResponse(404, "PLAYER_NOT_FOUND", "Player not found in this room")
    }

    touchPlayer(roomId, player.id)

    const snapshot = buildRoomSnapshot(roomId)
    if (!snapshot) {
      return errorResponse(500, "ROOM_SNAPSHOT_FAILED", "Unable to build room snapshot")
    }

    return jsonResponse(200, {
      room: snapshot,
      player: {
        id: player.id,
        name: player.displayName,
        avatarType: player.avatarType,
        avatarValue: player.avatarValue,
      },
    })
  })
}

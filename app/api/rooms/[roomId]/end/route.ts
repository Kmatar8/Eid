import { buildRoomSnapshot, completeRoomForHost } from "@/lib/server/store"
import { errorResponse, getBearerToken, jsonResponse } from "@/lib/server/http"
import { withRoomScopedStore } from "@/lib/server/store-sync"
import { isHostToken, verifyToken } from "@/lib/server/token"

export const runtime = "nodejs"

type RouteContext = {
  params: Promise<{ roomId: string }>
}

export async function POST(request: Request, context: RouteContext) {
  const { roomId } = await context.params
  if (!roomId) {
    return errorResponse(400, "VALIDATION_ERROR", "roomId is required")
  }

  return withRoomScopedStore(roomId, async () => {
    const bearer = getBearerToken(request)
    if (!bearer) {
      return errorResponse(401, "UNAUTHORIZED", "Missing bearer token")
    }

    const claims = verifyToken(bearer)
    if (!isHostToken(claims)) {
      return errorResponse(401, "UNAUTHORIZED", "Invalid host token")
    }

    const hostId = claims.hostId ?? claims.sub
    const completed = completeRoomForHost(hostId, roomId)
    if (!completed.ok) {
      if (completed.code === "HOST_NOT_FOUND") {
        return errorResponse(404, "HOST_NOT_FOUND", "Host account was not found")
      }

      if (completed.code === "ROOM_HOST_MISMATCH") {
        return errorResponse(403, "ROOM_HOST_MISMATCH", "Room does not belong to host")
      }

      return errorResponse(404, "ROOM_NOT_FOUND", "Room not found")
    }

    const snapshot = buildRoomSnapshot(roomId)
    if (!snapshot) {
      return errorResponse(500, "ROOM_SNAPSHOT_FAILED", "Unable to build room snapshot")
    }

    return jsonResponse(200, { room: snapshot })
  })
}

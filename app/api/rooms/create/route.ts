import { validateHostAccessCodeSession } from "@/lib/server/host-access-code-auth"
import { errorResponse, getBearerToken, jsonResponse } from "@/lib/server/http"
import {
  buildRoomSnapshot,
  createRoomForHost,
  ensureHostSessionRecord,
  isHostSessionActive,
} from "@/lib/server/store"
import { withSharedStore } from "@/lib/server/store-sync"
import { isHostToken, verifyToken } from "@/lib/server/token"

export const runtime = "nodejs"

export async function POST(request: Request) {
  return withSharedStore(async () => {
    const bearer = getBearerToken(request)
    if (!bearer) {
      return errorResponse(401, "UNAUTHORIZED", "Missing bearer token")
    }

    const claims = verifyToken(bearer)
    if (!isHostToken(claims)) {
      return errorResponse(401, "UNAUTHORIZED", "Invalid host token")
    }

    const hostId = claims.hostId ?? claims.sub
    const username = claims.username ?? hostId
    const sessionId = claims.sessionId
    const sessionValidation = await validateHostAccessCodeSession(username, sessionId)
    if (!sessionValidation.ok) {
      if (sessionValidation.reason === "DB_UNAVAILABLE") {
        if (!isHostSessionActive({ hostId, sessionId })) {
          return errorResponse(401, "HOST_SESSION_REVOKED", "Host session is no longer active")
        }
      } else if (sessionValidation.reason === "DB_ERROR") {
        return errorResponse(503, "AUTH_STORE_UNAVAILABLE", "Credential database is temporarily unavailable")
      } else if (sessionValidation.reason === "ACCESS_EXPIRED") {
        return errorResponse(403, "HOST_ACCESS_REVOKED", "Host access is revoked or expired")
      } else {
        return errorResponse(401, "HOST_SESSION_REVOKED", "Host session is no longer active")
      }
    } else if (sessionValidation.hostId !== hostId) {
      return errorResponse(401, "UNAUTHORIZED", "Invalid host token")
    }

    if (hostId && username) {
      ensureHostSessionRecord({ hostId, username })
    }

    const created = createRoomForHost(hostId)

    if (!created.ok) {
      if (created.code === "HOST_ALREADY_ACTIVE") {
        return errorResponse(
          409,
          "HOST_ALREADY_ACTIVE",
          "Host already has an active room",
          created.activeRoomId ? { activeRoomId: created.activeRoomId } : undefined
        )
      }

      return errorResponse(404, "HOST_NOT_FOUND", "Host account was not found")
    }

    const snapshot = buildRoomSnapshot(created.room.id)
    if (!snapshot) {
      return errorResponse(500, "ROOM_SNAPSHOT_FAILED", "Unable to create room snapshot")
    }

    const origin = new URL(request.url).origin
    const joinUrl = `${origin}/join/${created.room.id}`

    return jsonResponse(201, {
      room: snapshot,
      joinUrl,
      qrPayload: joinUrl,
    })
  })
}

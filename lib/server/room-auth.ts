import { validateHostAccessCodeSession } from "@/lib/server/host-access-code-auth"
import { getBearerToken } from "@/lib/server/http"
import { isHostSessionActive } from "@/lib/server/store"
import { isHostToken, isPlayerToken, verifyToken } from "@/lib/server/token"

export type RoomActor = {
  role: "host" | "player"
  actorId: string
}

type ActorResolveError = {
  ok: false
  status: number
  code: string
  message: string
}

type ActorResolveSuccess = {
  ok: true
  actor: RoomActor
}

export type RoomActorResolveResult = ActorResolveSuccess | ActorResolveError

function resolveHostAuthError(reason: string): ActorResolveError {
  if (reason === "ACCESS_EXPIRED") {
    return {
      ok: false,
      status: 403,
      code: "HOST_ACCESS_REVOKED",
      message: "Host access is revoked or expired",
    }
  }

  if (reason === "DB_ERROR") {
    return {
      ok: false,
      status: 503,
      code: "AUTH_STORE_UNAVAILABLE",
      message: "Credential database is temporarily unavailable",
    }
  }

  if (reason === "SESSION_REVOKED") {
    return {
      ok: false,
      status: 401,
      code: "HOST_SESSION_REVOKED",
      message: "Host session is no longer active",
    }
  }

  return {
    ok: false,
    status: 401,
    code: "UNAUTHORIZED",
    message: "Invalid host token",
  }
}

export async function resolveRoomActor(request: Request, roomId: string): Promise<RoomActorResolveResult> {
  const bearer = getBearerToken(request)
  if (!bearer) {
    return { ok: false, status: 401, code: "UNAUTHORIZED", message: "Missing bearer token" }
  }

  const claims = verifyToken(bearer)
  if (isHostToken(claims)) {
    const hostId = claims.hostId ?? claims.sub
    const sessionId = claims.sessionId
    const username = claims.username

    const dbSession = await validateHostAccessCodeSession(username, sessionId)
    if (dbSession.ok) {
      return {
        ok: true,
        actor: {
          role: "host",
          actorId: hostId,
        },
      }
    }

    if (dbSession.reason === "DB_UNAVAILABLE") {
      const fallbackActive = isHostSessionActive({ hostId, sessionId })
      if (!fallbackActive) {
        return {
          ok: false,
          status: 401,
          code: "HOST_SESSION_REVOKED",
          message: "Host session is no longer active",
        }
      }

      return {
        ok: true,
        actor: {
          role: "host",
          actorId: hostId,
        },
      }
    }

    return resolveHostAuthError(dbSession.reason)
  }

  if (isPlayerToken(claims)) {
    if (claims.roomId !== roomId) {
      return {
        ok: false,
        status: 403,
        code: "ROOM_TOKEN_MISMATCH",
        message: "Token does not belong to this room",
      }
    }

    return {
      ok: true,
      actor: {
        role: "player",
        actorId: claims.playerId,
      },
    }
  }

  return { ok: false, status: 401, code: "UNAUTHORIZED", message: "Invalid token" }
}

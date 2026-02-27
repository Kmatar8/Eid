import { getBearerToken } from "@/lib/server/http"
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

export function resolveRoomActor(request: Request, roomId: string): RoomActorResolveResult {
  const bearer = getBearerToken(request)
  if (!bearer) {
    return { ok: false, status: 401, code: "UNAUTHORIZED", message: "Missing bearer token" }
  }

  const claims = verifyToken(bearer)
  if (isHostToken(claims)) {
    return {
      ok: true,
      actor: {
        role: "host",
        actorId: claims.hostId ?? claims.sub,
      },
    }
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

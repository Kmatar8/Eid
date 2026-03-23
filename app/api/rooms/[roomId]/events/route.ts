import { errorResponse, jsonResponse } from "@/lib/server/http"
import { makeServerEnvelope } from "@/lib/server/protocol-v1"
import { resolveRoomActor } from "@/lib/server/room-auth"
import { getPlayerInRoom, getRoom, getRoomEventsSince, isRoomActiveState } from "@/lib/server/store"
import { retryWithFreshRoomShard, withRoomShardStore } from "@/lib/server/store-sync"

export const runtime = "nodejs"

type RouteContext = {
  params: Promise<{ roomId: string }>
}

function parsePositiveInt(value: string | null, fallback: number) {
  if (!value) {
    return fallback
  }

  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed) || parsed < 0) {
    return fallback
  }

  return parsed
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

    const authorization = await retryWithFreshRoomShard(
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

        return { ok: true as const, room }
      },
      (result) =>
        !result.ok &&
        (result.code === "ROOM_NOT_FOUND" ||
          result.code === "HOST_ROOM_MISMATCH" ||
          result.code === "ROOM_NOT_ACTIVE" ||
          result.code === "PLAYER_NOT_FOUND")
    )
    if (!authorization.ok) {
      return errorResponse(authorization.status, authorization.code, authorization.message, authorization.details)
    }

    const { searchParams } = new URL(request.url)
    const sinceVersion = parsePositiveInt(searchParams.get("since"), 0)
    const limit = Math.min(parsePositiveInt(searchParams.get("limit"), 50), 200)

    const events = getRoomEventsSince(roomId, sinceVersion, limit)
    return jsonResponse(
      200,
      makeServerEnvelope("room.diff", {
        roomId,
        sinceVersion,
        currentVersion: authorization.room.version,
        events,
      })
    )
  })
}

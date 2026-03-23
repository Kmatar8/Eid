import { buildRoomSnapshot, createPlayerForRoom, getRoom, isRoomJoinableState } from "@/lib/server/store"
import { errorResponse, jsonResponse, safeJson } from "@/lib/server/http"
import { retryWithFreshRoomShard, withRoomShardStore } from "@/lib/server/store-sync"
import { signToken } from "@/lib/server/token"

export const runtime = "nodejs"

type JoinBody = {
  name?: string
  avatarEmoji?: string
  avatarImageUrl?: string
}

type RouteContext = {
  params: Promise<{ roomId: string }>
}

function validateName(name: string) {
  const trimmed = name.trim()
  return trimmed.length >= 2 && trimmed.length <= 40
}

export async function POST(request: Request, context: RouteContext) {
  const { roomId } = await context.params
  if (!roomId) {
    return errorResponse(400, "VALIDATION_ERROR", "roomId is required")
  }

  return withRoomShardStore(roomId, async () => {
    const joinableState = await retryWithFreshRoomShard(
      roomId,
      () => {
        const room = getRoom(roomId)
        if (!room) {
          return { ok: false as const, code: "ROOM_NOT_FOUND" as const }
        }

        if (!isRoomJoinableState(room.state)) {
          return { ok: false as const, code: "ROOM_NOT_JOINABLE" as const }
        }

        return { ok: true as const }
      },
      (result) => !result.ok
    )
    if (!joinableState.ok) {
      if (joinableState.code === "ROOM_NOT_JOINABLE") {
        return errorResponse(409, "ROOM_NOT_JOINABLE", "Room is not accepting new players")
      }

      return errorResponse(404, "ROOM_NOT_FOUND", "Room not found")
    }

    const body = await safeJson<JoinBody>(request)
    if (!body) {
      return errorResponse(400, "BAD_JSON", "Request body must be valid JSON")
    }

    const name = typeof body.name === "string" ? body.name : ""
    if (!validateName(name)) {
      return errorResponse(400, "VALIDATION_ERROR", "name must be between 2 and 40 characters")
    }

    const created = await retryWithFreshRoomShard(
      roomId,
      () =>
        createPlayerForRoom(roomId, {
          displayName: name.trim(),
          avatarEmoji: typeof body.avatarEmoji === "string" ? body.avatarEmoji : undefined,
          avatarImageUrl: typeof body.avatarImageUrl === "string" ? body.avatarImageUrl : undefined,
        }),
      (result) => !result.ok && (result.code === "ROOM_NOT_FOUND" || result.code === "ROOM_NOT_JOINABLE")
    )

    if (!created.ok) {
      if (created.code === "ROOM_NOT_JOINABLE") {
        return errorResponse(409, "ROOM_NOT_JOINABLE", "Room is not accepting new players")
      }

      return errorResponse(404, "ROOM_NOT_FOUND", "Room not found")
    }

    const playerToken = signToken(
      {
        sub: created.player.id,
        role: "player",
        playerId: created.player.id,
        roomId,
      },
      60 * 60 * 24
    )

    const snapshot = buildRoomSnapshot(roomId)
    if (!snapshot) {
      return errorResponse(500, "ROOM_SNAPSHOT_FAILED", "Unable to build room snapshot")
    }

    return jsonResponse(201, {
      playerToken,
      player: {
        id: created.player.id,
        name: created.player.displayName,
        avatarType: created.player.avatarType,
        avatarValue: created.player.avatarValue,
      },
      room: snapshot,
    })
  })
}

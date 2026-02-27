import { errorResponse, jsonResponse, safeJson } from "@/lib/server/http"
import { isActionAllowedForRole, isClientEnvelope, makeServerEnvelope } from "@/lib/server/protocol-v1"
import { resolveRoomActor } from "@/lib/server/room-auth"
import { applyRoomAction, buildRoomSnapshot } from "@/lib/server/store"
import { withSharedStore } from "@/lib/server/store-sync"

export const runtime = "nodejs"

type RouteContext = {
  params: Promise<{ roomId: string }>
}

export async function POST(request: Request, context: RouteContext) {
  return withSharedStore(async () => {
    const { roomId } = await context.params
    if (!roomId) {
      return errorResponse(400, "VALIDATION_ERROR", "roomId is required")
    }

    const actor = resolveRoomActor(request, roomId)
    if (!actor.ok) {
      return errorResponse(actor.status, actor.code, actor.message)
    }

    const rawBody = await safeJson<unknown>(request)
    if (!rawBody || !isClientEnvelope(rawBody)) {
      return errorResponse(400, "INVALID_PROTOCOL_ENVELOPE", "Body must follow protocol v1 envelope")
    }

    if (!isActionAllowedForRole(rawBody.type, actor.actor.role)) {
      return errorResponse(403, "ACTION_FORBIDDEN", "Action is not allowed for this actor role")
    }

    const applied = applyRoomAction({
      roomId,
      actorRole: actor.actor.role,
      actorId: actor.actor.actorId,
      actionType: rawBody.type,
      requestId: rawBody.requestId,
      payload: rawBody.payload,
    })

    if (!applied.ok) {
      if (applied.code === "ROOM_NOT_FOUND") {
        return errorResponse(404, "ROOM_NOT_FOUND", "Room not found")
      }

      if (applied.code === "ROOM_NOT_ACTIVE") {
        return errorResponse(409, "ROOM_NOT_ACTIVE", "Room is no longer active", {
          state: applied.state,
        })
      }

      if (applied.code === "PLAYER_NOT_FOUND") {
        return errorResponse(404, "PLAYER_NOT_FOUND", "Player not found in this room")
      }

      if (applied.code === "HOST_ROOM_MISMATCH") {
        return errorResponse(403, "HOST_ROOM_MISMATCH", "Room does not belong to host")
      }

      if (applied.code === "INVALID_STATE_TRANSITION") {
        return errorResponse(409, "INVALID_STATE_TRANSITION", "Action is invalid for current room state", {
          state: applied.state,
        })
      }

      if (applied.code === "TEAM_NOT_FOUND") {
        return errorResponse(404, "TEAM_NOT_FOUND", "Target team was not found")
      }

      if (applied.code === "INVALID_TEAM_ASSIGNMENT") {
        return errorResponse(400, "INVALID_TEAM_ASSIGNMENT", "playerId and teamId are required")
      }

      if (applied.code === "INVALID_TEAM_NAME") {
        return errorResponse(400, "INVALID_TEAM_NAME", "Team name must be between 2 and 24 characters")
      }

      if (applied.code === "INVALID_DELTA") {
        return errorResponse(400, "INVALID_DELTA", "Score delta must be a non-zero number")
      }

      if (applied.code === "TRIVIA_NOT_ACTIVE") {
        return errorResponse(409, "TRIVIA_NOT_ACTIVE", "Trivia session is not active")
      }

      if (applied.code === "TRIVIA_INVALID_CLUE") {
        return errorResponse(400, "TRIVIA_INVALID_CLUE", "Selected clue is invalid or already used")
      }

      if (applied.code === "TRIVIA_NO_ALTERNATE_RESPONDER") {
        return errorResponse(
          409,
          "TRIVIA_NO_ALTERNATE_RESPONDER",
          "No alternate responder is available in the active team"
        )
      }

      if (applied.code === "TRIVIA_INVALID_RESPONDER") {
        return errorResponse(403, "TRIVIA_INVALID_RESPONDER", "Only the selected responder can answer")
      }

      if (applied.code === "INVALID_OPTION") {
        return errorResponse(400, "INVALID_OPTION", "Answer option must be one of A, B, C, or D")
      }

      return errorResponse(400, "ACTION_NOT_SUPPORTED", "Action type is not supported")
    }

    const snapshot = buildRoomSnapshot(roomId)
    if (!snapshot) {
      return errorResponse(500, "ROOM_SNAPSHOT_FAILED", "Unable to build room snapshot")
    }

    const envelope = makeServerEnvelope(
      "room.ack",
      {
        room: snapshot,
        event: applied.event,
      },
      rawBody.requestId
    )

    return jsonResponse(200, envelope)
  })
}

import { type ActiveGame, type RoomState } from "@/lib/server/types"
import {
  buildRoomSnapshot,
  getHostLastSeenAt,
  getRoom,
  isRoomActiveState,
  listHostRoomAssignments,
  type HostRoomAssignment,
} from "@/lib/server/store"
import { withRoomShardStore, withSharedStore } from "@/lib/server/store-sync"

export const DEFAULT_HOST_PRESENCE_MS = 30_000
export const DEFAULT_CONTROLLER_PRESENCE_MS = 45_000

export type RuntimeActivityThresholds = {
  hostPresenceMs: number
  controllerPresenceMs: number
}

export type RoomActivityEntry = {
  roomId: string
  hostId: string
  hostUsername: string
  roomFound: boolean
  roomActive: boolean
  state: RoomState | null
  activeGame: ActiveGame | null
  version: number | null
  updatedAt: number | null
  expiresAt: number | null
  hostLastSeenAt: number | null
  hostHeartbeatAgeMs: number | null
  hostPresent: boolean
  joinedControllers: number
  activeControllers: number
  staleControllers: number
}

export type RuntimeActivitySummary = {
  observedAt: number
  thresholds: RuntimeActivityThresholds
  summary: {
    hosts: {
      withActiveRoomAssignment: number
      present: number
      stale: number
    }
    rooms: {
      assigned: number
      active: number
      missing: number
      inactive: number
      byState: Partial<Record<RoomState, number>>
      byActiveGame: Partial<Record<ActiveGame, number>>
    }
    controllers: {
      joinedInActiveRooms: number
      activeInActiveRooms: number
      staleInActiveRooms: number
    }
  }
  rooms: RoomActivityEntry[]
}

export type RuntimeActivityOptions = {
  controllerPresenceMs?: number
  hostPresenceMs?: number
}

function resolveThreshold(value: number | undefined, fallback: number) {
  if (!Number.isFinite(value) || !value || value <= 0) {
    return fallback
  }

  return Math.floor(value)
}

async function readRoomActivity(
  assignment: HostRoomAssignment,
  observedAt: number,
  thresholds: RuntimeActivityThresholds
): Promise<RoomActivityEntry> {
  const roomId = assignment.activeRoomId
  if (!roomId) {
    return {
      roomId: "",
      hostId: assignment.hostId,
      hostUsername: assignment.username,
      roomFound: false,
      roomActive: false,
      state: null,
      activeGame: null,
      version: null,
      updatedAt: null,
      expiresAt: null,
      hostLastSeenAt: null,
      hostHeartbeatAgeMs: null,
      hostPresent: false,
      joinedControllers: 0,
      activeControllers: 0,
      staleControllers: 0,
    }
  }

  return withRoomShardStore(roomId, async () => {
    const room = getRoom(roomId)
    if (!room) {
      return {
        roomId,
        hostId: assignment.hostId,
        hostUsername: assignment.username,
        roomFound: false,
        roomActive: false,
        state: null,
        activeGame: null,
        version: null,
        updatedAt: null,
        expiresAt: null,
        hostLastSeenAt: null,
        hostHeartbeatAgeMs: null,
        hostPresent: false,
        joinedControllers: 0,
        activeControllers: 0,
        staleControllers: 0,
      }
    }

    const snapshot = buildRoomSnapshot(roomId)
    if (!snapshot) {
      return {
        roomId,
        hostId: assignment.hostId,
        hostUsername: assignment.username,
        roomFound: true,
        roomActive: false,
        state: room.state,
        activeGame: room.activeGame,
        version: room.version,
        updatedAt: room.updatedAt,
        expiresAt: room.expiresAt,
        hostLastSeenAt: null,
        hostHeartbeatAgeMs: null,
        hostPresent: false,
        joinedControllers: 0,
        activeControllers: 0,
        staleControllers: 0,
      }
    }

    const hostLastSeenAt = getHostLastSeenAt(roomId)
    const hostHeartbeatAgeMs = typeof hostLastSeenAt === "number" ? Math.max(0, observedAt - hostLastSeenAt) : null
    const hostPresent = hostHeartbeatAgeMs !== null && hostHeartbeatAgeMs <= thresholds.hostPresenceMs
    const activeControllers = snapshot.players.filter(
      (player) => observedAt - player.lastSeenAt <= thresholds.controllerPresenceMs
    ).length
    const joinedControllers = snapshot.players.length

    return {
      roomId,
      hostId: assignment.hostId,
      hostUsername: assignment.username,
      roomFound: true,
      roomActive: isRoomActiveState(room.state),
      state: room.state,
      activeGame: room.activeGame,
      version: room.version,
      updatedAt: room.updatedAt,
      expiresAt: room.expiresAt,
      hostLastSeenAt,
      hostHeartbeatAgeMs,
      hostPresent,
      joinedControllers,
      activeControllers,
      staleControllers: joinedControllers - activeControllers,
    }
  })
}

export async function getRuntimeActivitySummary(
  options: RuntimeActivityOptions = {}
): Promise<RuntimeActivitySummary> {
  const thresholds: RuntimeActivityThresholds = {
    hostPresenceMs: resolveThreshold(options.hostPresenceMs, DEFAULT_HOST_PRESENCE_MS),
    controllerPresenceMs: resolveThreshold(options.controllerPresenceMs, DEFAULT_CONTROLLER_PRESENCE_MS),
  }

  return withSharedStore(async () => {
    const observedAt = Date.now()
    const assignments = listHostRoomAssignments().filter((host) => Boolean(host.activeRoomId))
    const seenRoomIds = new Set<string>()
    const rooms: RoomActivityEntry[] = []

    for (const assignment of assignments) {
      const roomId = assignment.activeRoomId
      if (!roomId || seenRoomIds.has(roomId)) {
        continue
      }

      seenRoomIds.add(roomId)
      rooms.push(await readRoomActivity(assignment, observedAt, thresholds))
    }

    const activeRooms = rooms.filter((room) => room.roomActive)
    const inactiveRooms = rooms.filter((room) => room.roomFound && !room.roomActive)
    const missingRooms = rooms.filter((room) => !room.roomFound)

    const byState: Partial<Record<RoomState, number>> = {}
    const byActiveGame: Partial<Record<ActiveGame, number>> = {}

    for (const room of activeRooms) {
      if (room.state) {
        byState[room.state] = (byState[room.state] ?? 0) + 1
      }
      if (room.activeGame) {
        byActiveGame[room.activeGame] = (byActiveGame[room.activeGame] ?? 0) + 1
      }
    }

    const joinedInActiveRooms = activeRooms.reduce((sum, room) => sum + room.joinedControllers, 0)
    const activeInActiveRooms = activeRooms.reduce((sum, room) => sum + room.activeControllers, 0)

    return {
      observedAt,
      thresholds,
      summary: {
        hosts: {
          withActiveRoomAssignment: assignments.length,
          present: activeRooms.filter((room) => room.hostPresent).length,
          stale: assignments.length - activeRooms.filter((room) => room.hostPresent).length,
        },
        rooms: {
          assigned: rooms.length,
          active: activeRooms.length,
          missing: missingRooms.length,
          inactive: inactiveRooms.length,
          byState,
          byActiveGame,
        },
        controllers: {
          joinedInActiveRooms,
          activeInActiveRooms,
          staleInActiveRooms: joinedInActiveRooms - activeInActiveRooms,
        },
      },
      rooms: rooms.sort((left, right) => {
        if (left.roomActive !== right.roomActive) {
          return left.roomActive ? -1 : 1
        }

        return (right.updatedAt ?? 0) - (left.updatedAt ?? 0)
      }),
    }
  })
}

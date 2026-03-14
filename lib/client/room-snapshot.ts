import type { RoomSnapshot } from "@/lib/server/types"

export function preferNewerRoomSnapshot(current: RoomSnapshot | null, incoming: RoomSnapshot) {
  if (!current || current.roomId !== incoming.roomId) {
    return incoming
  }

  if (incoming.version < current.version) {
    return current
  }

  if (incoming.version === current.version && incoming.updatedAt < current.updatedAt) {
    return current
  }

  return incoming
}

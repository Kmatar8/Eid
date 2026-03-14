import assert from "node:assert/strict"

import { preferNewerRoomSnapshot } from "../lib/client/room-snapshot"
import {
  buildRoomSnapshot,
  createPlayerForRoom,
  createRoomForHost,
  ensureHostSessionRecord,
  exportRoomShardSnapshot,
  importRoomShardSnapshot,
} from "../lib/server/store"

function makeHostIdentity() {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  return {
    hostId: `test-host-${suffix}`,
    username: `test-host-${suffix}`,
  }
}

function testPreferNewerRoomSnapshot() {
  const host = makeHostIdentity()
  ensureHostSessionRecord(host)
  const created = createRoomForHost(host.hostId)
  assert.equal(created.ok, true, "room should be created for snapshot preference test")
  if (!created.ok) {
    return
  }

  const roomId = created.room.id
  const initialSnapshot = buildRoomSnapshot(roomId)
  assert.ok(initialSnapshot, "initial snapshot should exist")
  if (!initialSnapshot) {
    return
  }

  createPlayerForRoom(roomId, { displayName: "Player A", avatarEmoji: "A" })
  const newerSnapshot = buildRoomSnapshot(roomId)
  assert.ok(newerSnapshot, "newer snapshot should exist")
  if (!newerSnapshot) {
    return
  }

  const preferred = preferNewerRoomSnapshot(newerSnapshot, initialSnapshot)
  assert.equal(preferred.version, newerSnapshot.version, "client should ignore older room versions")
  assert.equal(preferred.playerCount, newerSnapshot.playerCount, "client should keep newer player membership")
}

function testRejectStaleRoomShardImport() {
  const host = makeHostIdentity()
  ensureHostSessionRecord(host)
  const created = createRoomForHost(host.hostId)
  assert.equal(created.ok, true, "room should be created for stale shard test")
  if (!created.ok) {
    return
  }

  const roomId = created.room.id
  const staleSnapshot = exportRoomShardSnapshot(roomId)
  assert.ok(staleSnapshot, "stale snapshot seed should exist")

  const joined = createPlayerForRoom(roomId, { displayName: "Player B", avatarEmoji: "B" })
  assert.equal(joined.ok, true, "player should join before stale import")

  const beforeImport = buildRoomSnapshot(roomId)
  assert.ok(beforeImport, "snapshot before stale import should exist")
  if (!beforeImport) {
    return
  }

  const imported = importRoomShardSnapshot(roomId, staleSnapshot)
  assert.equal(imported, false, "older room shard snapshot should be rejected")

  const afterImport = buildRoomSnapshot(roomId)
  assert.ok(afterImport, "snapshot after stale import should exist")
  if (!afterImport) {
    return
  }

  assert.equal(afterImport.version, beforeImport.version, "stale import must not rewind room version")
  assert.equal(afterImport.playerCount, beforeImport.playerCount, "stale import must not drop joined players")
}

function testRejectRoomRemovalImport() {
  const host = makeHostIdentity()
  ensureHostSessionRecord(host)
  const created = createRoomForHost(host.hostId)
  assert.equal(created.ok, true, "room should be created for null-room import test")
  if (!created.ok) {
    return
  }

  const roomId = created.room.id
  const removed = importRoomShardSnapshot(roomId, {
    room: null,
    players: [],
    teams: [],
    teamAssignments: [],
    trivia: null,
    haraj: null,
    hostLastSeenAt: null,
    pausedFromState: null,
    processedHostCommands: [],
    processedPlayerSubmit: [],
    roomEvents: [],
  })
  assert.equal(removed, false, "empty room shard should not wipe an existing room")
  assert.ok(buildRoomSnapshot(roomId), "existing room should still be readable after null-room import")
}

function main() {
  testPreferNewerRoomSnapshot()
  testRejectStaleRoomShardImport()
  testRejectRoomRemovalImport()
  console.log("connectivity hardening checks passed")
}

main()

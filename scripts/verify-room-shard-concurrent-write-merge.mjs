import assert from "node:assert/strict"

import { mergeRoomStatePayloads } from "../workers/room-do/state-merge.mjs"

function makeRoom(overrides = {}) {
  return {
    id: "room_test",
    hostId: "host_1",
    state: "lobby_open",
    activeGame: null,
    version: 0,
    createdAt: 100,
    updatedAt: 100,
    expiresAt: 1000,
    pausedAt: null,
    completedAt: null,
    supersededBy: null,
    ...overrides,
  }
}

function makePlayer(id, joinedAt, overrides = {}) {
  return {
    id,
    roomId: "room_test",
    displayName: id,
    avatarType: "emoji",
    avatarValue: "🙂",
    joinedAt,
    lastSeenAt: joinedAt,
    ...overrides,
  }
}

function makeEvent(id, roomVersion, createdAt, eventType, payload = {}) {
  return {
    id,
    seq: roomVersion,
    roomId: "room_test",
    roomVersion,
    eventType,
    payload,
    createdAt,
  }
}

function makeSnapshot(overrides = {}) {
  return {
    room: makeRoom(),
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
    ...overrides,
  }
}

function makePayload(snapshot, updatedAt = 0) {
  return {
    snapshot,
    updatedAt,
  }
}

function assertPlayerIds(payload, expectedPlayerIds) {
  assert.deepEqual(
    payload.snapshot.players.map((player) => player.id),
    expectedPlayerIds
  )
}

function verifyConcurrentJoinMerge() {
  const existing = makePayload(
    makeSnapshot({
      room: makeRoom({ version: 1, updatedAt: 110 }),
      players: [makePlayer("player_a", 110)],
      roomEvents: [makeEvent("evt_join_a", 1, 110, "player.joined", { playerId: "player_a" })],
    }),
    110
  )

  const incoming = makePayload(
    makeSnapshot({
      room: makeRoom({ version: 1, updatedAt: 112 }),
      players: [makePlayer("player_b", 112)],
      roomEvents: [makeEvent("evt_join_b", 1, 112, "player.joined", { playerId: "player_b" })],
    }),
    112
  )

  const merged = mergeRoomStatePayloads(existing, incoming)
  assertPlayerIds(merged, ["player_a", "player_b"])
  assert.equal(merged.snapshot.room.version, 1)
  assert.equal(merged.snapshot.room.updatedAt, 112)
  assert.equal(merged.snapshot.roomEvents.length, 2)
  assert.equal(merged.updatedAt, 112)
}

function verifyNewerStructuralStateKeepsPlayers() {
  const existing = makePayload(
    makeSnapshot({
      room: makeRoom({ version: 1, updatedAt: 120 }),
      players: [makePlayer("player_a", 110), makePlayer("player_b", 120)],
      roomEvents: [
        makeEvent("evt_join_a", 1, 110, "player.joined", { playerId: "player_a" }),
        makeEvent("evt_join_b", 1, 120, "player.joined", { playerId: "player_b" }),
      ],
    }),
    120
  )

  const incoming = makePayload(
    makeSnapshot({
      room: makeRoom({ state: "lobby_locked", version: 2, updatedAt: 130 }),
      players: [makePlayer("player_a", 110)],
      roomEvents: [makeEvent("evt_lock", 2, 130, "room.lobby_locked", { hostId: "host_1" })],
    }),
    130
  )

  const merged = mergeRoomStatePayloads(existing, incoming)
  assert.equal(merged.snapshot.room.state, "lobby_locked")
  assert.equal(merged.snapshot.room.version, 2)
  assertPlayerIds(merged, ["player_a", "player_b"])
  assert.equal(merged.snapshot.roomEvents.length, 3)
}

function verifyPartialHeartbeatMerge() {
  const existing = makePayload(
    makeSnapshot({
      room: makeRoom({ version: 1, updatedAt: 150 }),
      players: [
        makePlayer("player_a", 110, { lastSeenAt: 150 }),
        makePlayer("player_b", 120, { lastSeenAt: 150 }),
      ],
    }),
    150
  )

  const incoming = makePayload(
    makeSnapshot({
      room: makeRoom({ version: 1, updatedAt: 220 }),
      players: [makePlayer("player_b", 120, { lastSeenAt: 220 })],
    }),
    220
  )

  const merged = mergeRoomStatePayloads(existing, incoming)
  assertPlayerIds(merged, ["player_a", "player_b"])
  const mergedPlayerB = merged.snapshot.players.find((player) => player.id === "player_b")
  assert.ok(mergedPlayerB)
  assert.equal(mergedPlayerB.lastSeenAt, 220)
  assert.equal(merged.snapshot.room.updatedAt, 220)
}

verifyConcurrentJoinMerge()
verifyNewerStructuralStateKeepsPlayers()
verifyPartialHeartbeatMerge()

console.log("verify-room-shard-concurrent-write-merge: ok")

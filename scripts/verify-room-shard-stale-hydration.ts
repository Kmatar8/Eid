import assert from "node:assert/strict"

import {
  applyRoomAction,
  createPlayerForRoom,
  createRoomForHost,
  ensureHostSessionRecord,
  exportRoomShardSnapshot,
  getHostLastSeenAt,
  getRoom,
  importRoomShardSnapshot,
  touchPlayer,
} from "@/lib/server/store"

function runWithFrozenClock(run: (advanceMs: (ms: number) => void, now: () => number) => void) {
  const originalDateNow = Date.now
  let currentNow = 1_800_000_000_000
  Date.now = () => currentNow

  try {
    run(
      (ms) => {
        currentNow += ms
      },
      () => currentNow
    )
  } finally {
    Date.now = originalDateNow
  }
}

function bootstrapTeamsReadyRoom(seed: string) {
  const hostId = `host_test_${seed}`
  ensureHostSessionRecord({ hostId, username: `TEST-${seed}` })

  const created = createRoomForHost(hostId)
  assert.equal(created.ok, true, "expected room creation to succeed")
  if (!created.ok) {
    throw new Error("room creation failed")
  }

  const roomId = created.room.id
  const joined = createPlayerForRoom(roomId, { displayName: `Player ${seed}`, avatarEmoji: "🎮" })
  assert.equal(joined.ok, true, "expected player creation to succeed")
  if (!joined.ok) {
    throw new Error("player creation failed")
  }

  const lockAck = applyRoomAction({
    roomId,
    actorRole: "host",
    actorId: hostId,
    actionType: "host.lockLobby",
  })
  assert.equal(lockAck.ok, true, "expected host.lockLobby to succeed")

  const teamsAck = applyRoomAction({
    roomId,
    actorRole: "host",
    actorId: hostId,
    actionType: "host.startTeams",
  })
  assert.equal(teamsAck.ok, true, "expected host.startTeams to succeed")

  const room = getRoom(roomId)
  assert(room, "expected room to exist after bootstrap")
  assert.equal(room.state, "teams_ready", "expected teams_ready room state after bootstrap")

  return {
    hostId,
    roomId,
    playerId: joined.player.id,
  }
}

function verifyPlayerActivityPreventsStaleHydrationTermination() {
  const context = bootstrapTeamsReadyRoom("player_activity")
  const staleSnapshot = exportRoomShardSnapshot(context.roomId)
  assert(staleSnapshot, "expected stale room shard snapshot to exist")

  const INACTIVITY_MS = 30 * 60 * 1000
  const PLAYER_ACTIVITY_AT_MS = 25 * 60 * 1000
  const IMPORT_AT_MS = 31 * 60 * 1000

  return {
    context,
    staleSnapshot,
    INACTIVITY_MS,
    PLAYER_ACTIVITY_AT_MS,
    IMPORT_AT_MS,
  }
}

runWithFrozenClock((advanceMs, now) => {
  {
    const scenario = verifyPlayerActivityPreventsStaleHydrationTermination()

    advanceMs(scenario.PLAYER_ACTIVITY_AT_MS)
    assert.equal(touchPlayer(scenario.context.roomId, scenario.context.playerId), true, "expected player touch to succeed")

    advanceMs(scenario.IMPORT_AT_MS - scenario.PLAYER_ACTIVITY_AT_MS)
    assert.equal(
      importRoomShardSnapshot(scenario.context.roomId, scenario.staleSnapshot),
      false,
      "expected stale player-activity shard import to be rejected"
    )

    const room = getRoom(scenario.context.roomId)
    assert(room, "expected room to still exist after stale player-activity import")
    assert.equal(room.state, "teams_ready", "stale player-activity shard import must not pause the room")
    assert(
      room.updatedAt >= now() - (scenario.IMPORT_AT_MS - scenario.PLAYER_ACTIVITY_AT_MS),
      "expected newer local room.updatedAt to remain intact after stale player-activity import"
    )
    assert(
      now() - room.updatedAt < scenario.INACTIVITY_MS,
      "expected player activity to keep the room below the inactivity threshold"
    )
  }

  {
    const context = bootstrapTeamsReadyRoom("host_heartbeat")
    const staleSnapshot = exportRoomShardSnapshot(context.roomId)
    assert(staleSnapshot, "expected stale host-heartbeat shard snapshot to exist")

    const INACTIVITY_MS = 30 * 60 * 1000
    const HOST_ACTIVITY_AT_MS = 25 * 60 * 1000
    const IMPORT_AT_MS = 31 * 60 * 1000

    advanceMs(HOST_ACTIVITY_AT_MS)
    const heartbeatAck = applyRoomAction({
      roomId: context.roomId,
      actorRole: "host",
      actorId: context.hostId,
      actionType: "host.heartbeat",
    })
    assert.equal(heartbeatAck.ok, true, "expected host heartbeat to succeed")

    const hostLastSeenAt = getHostLastSeenAt(context.roomId)
    assert.equal(hostLastSeenAt, now(), "expected host heartbeat to refresh hostLastSeenAt")

    advanceMs(IMPORT_AT_MS - HOST_ACTIVITY_AT_MS)
    assert.equal(
      importRoomShardSnapshot(context.roomId, staleSnapshot),
      false,
      "expected stale host-heartbeat shard import to be rejected"
    )

    const room = getRoom(context.roomId)
    assert(room, "expected room to still exist after stale host-heartbeat import")
    assert.equal(room.state, "teams_ready", "stale host-heartbeat shard import must not pause the room")
    assert.equal(getHostLastSeenAt(context.roomId), hostLastSeenAt, "expected newer hostLastSeenAt to remain intact")
    assert(
      now() - (getHostLastSeenAt(context.roomId) ?? 0) < INACTIVITY_MS,
      "expected host heartbeat to keep the room below the inactivity threshold"
    )
  }

  console.log("room shard stale hydration verification passed")
})

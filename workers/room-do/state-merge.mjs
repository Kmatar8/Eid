const MAX_MERGED_ROOM_EVENTS = 400

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function cloneJson(value) {
  if (value === undefined) {
    return undefined
  }

  return JSON.parse(JSON.stringify(value))
}

function getFiniteNumber(value, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback
}

function getArray(value) {
  return Array.isArray(value) ? value : []
}

function getRoomSnapshotRoomId(snapshot) {
  const room = isObject(snapshot) && isObject(snapshot.room) ? snapshot.room : null
  return room && typeof room.id === "string" ? room.id : null
}

function isRoomShardSnapshotLike(snapshot) {
  if (!isObject(snapshot)) {
    return false
  }

  return (
    Array.isArray(snapshot.players) &&
    Array.isArray(snapshot.teams) &&
    Array.isArray(snapshot.teamAssignments) &&
    Array.isArray(snapshot.processedHostCommands) &&
    Array.isArray(snapshot.processedPlayerSubmit) &&
    Array.isArray(snapshot.roomEvents)
  )
}

function getPlayerActivityAt(player) {
  if (!isObject(player)) {
    return 0
  }

  return Math.max(getFiniteNumber(player.joinedAt), getFiniteNumber(player.lastSeenAt))
}

function getEventFreshnessScore(event) {
  if (!isObject(event)) {
    return [0, 0, 0]
  }

  return [
    getFiniteNumber(event.roomVersion),
    getFiniteNumber(event.createdAt),
    getFiniteNumber(event.seq),
  ]
}

function compareTuple(left, right) {
  const length = Math.max(left.length, right.length)
  for (let index = 0; index < length; index += 1) {
    const leftValue = left[index] ?? 0
    const rightValue = right[index] ?? 0
    if (leftValue !== rightValue) {
      return leftValue > rightValue ? 1 : -1
    }
  }

  return 0
}

function getSnapshotLatestActivityAt(snapshot) {
  if (!isRoomShardSnapshotLike(snapshot)) {
    return 0
  }

  const room = isObject(snapshot.room) ? snapshot.room : null
  let latest = Math.max(
    getFiniteNumber(room?.createdAt),
    getFiniteNumber(room?.updatedAt),
    getFiniteNumber(snapshot.hostLastSeenAt)
  )

  for (const player of getArray(snapshot.players)) {
    latest = Math.max(latest, getPlayerActivityAt(player))
  }

  for (const event of getArray(snapshot.roomEvents)) {
    latest = Math.max(latest, getFiniteNumber(isObject(event) ? event.createdAt : 0))
  }

  return latest
}

function compareSnapshotFreshness(left, right) {
  const leftRoom = isObject(left?.room) ? left.room : null
  const rightRoom = isObject(right?.room) ? right.room : null

  const versionDiff =
    getFiniteNumber(leftRoom?.version, -1) - getFiniteNumber(rightRoom?.version, -1)
  if (versionDiff !== 0) {
    return versionDiff > 0 ? 1 : -1
  }

  const activityDiff = getSnapshotLatestActivityAt(left) - getSnapshotLatestActivityAt(right)
  if (activityDiff !== 0) {
    return activityDiff > 0 ? 1 : -1
  }

  const playerCountDiff = getArray(left?.players).length - getArray(right?.players).length
  if (playerCountDiff !== 0) {
    return playerCountDiff > 0 ? 1 : -1
  }

  const eventCountDiff = getArray(left?.roomEvents).length - getArray(right?.roomEvents).length
  if (eventCountDiff !== 0) {
    return eventCountDiff > 0 ? 1 : -1
  }

  return 0
}

function mergePlayerRecord(current, candidate) {
  const currentRecord = isObject(current) ? current : null
  const candidateRecord = isObject(candidate) ? candidate : null
  if (!currentRecord) {
    return cloneJson(candidateRecord)
  }
  if (!candidateRecord) {
    return cloneJson(currentRecord)
  }

  const currentActivityAt = getPlayerActivityAt(currentRecord)
  const candidateActivityAt = getPlayerActivityAt(candidateRecord)
  const preferred = candidateActivityAt >= currentActivityAt ? candidateRecord : currentRecord
  const secondary = preferred === candidateRecord ? currentRecord : candidateRecord

  const currentJoinedAt = getFiniteNumber(currentRecord.joinedAt)
  const candidateJoinedAt = getFiniteNumber(candidateRecord.joinedAt)
  const joinedAtCandidates = [currentJoinedAt, candidateJoinedAt].filter((value) => value > 0)

  return {
    ...cloneJson(secondary),
    ...cloneJson(preferred),
    joinedAt: joinedAtCandidates.length > 0 ? Math.min(...joinedAtCandidates) : 0,
    lastSeenAt: Math.max(getFiniteNumber(currentRecord.lastSeenAt), getFiniteNumber(candidateRecord.lastSeenAt)),
  }
}

function mergePlayers(preferredSnapshot, secondarySnapshot, roomId) {
  const playersById = new Map()

  for (const snapshot of [secondarySnapshot, preferredSnapshot]) {
    for (const player of getArray(snapshot?.players)) {
      if (!isObject(player) || typeof player.id !== "string") {
        continue
      }

      if (typeof roomId === "string" && roomId.length > 0 && player.roomId !== roomId) {
        continue
      }

      const existing = playersById.get(player.id)
      playersById.set(player.id, mergePlayerRecord(existing, player))
    }
  }

  return Array.from(playersById.values()).sort((left, right) => {
    const joinedAtDiff = getFiniteNumber(left.joinedAt) - getFiniteNumber(right.joinedAt)
    if (joinedAtDiff !== 0) {
      return joinedAtDiff
    }

    return String(left.id).localeCompare(String(right.id))
  })
}

function mergeTeams(preferredSnapshot, secondarySnapshot, roomId) {
  const teamsById = new Map()

  for (const snapshot of [secondarySnapshot, preferredSnapshot]) {
    for (const team of getArray(snapshot?.teams)) {
      if (!isObject(team) || typeof team.id !== "string") {
        continue
      }

      const normalized = {
        ...cloneJson(team),
        roomId: typeof roomId === "string" && roomId.length > 0 ? roomId : team.roomId,
      }
      teamsById.set(team.id, normalized)
    }
  }

  return Array.from(teamsById.values()).sort((left, right) => {
    const orderDiff = getFiniteNumber(left.order) - getFiniteNumber(right.order)
    if (orderDiff !== 0) {
      return orderDiff
    }

    return String(left.id).localeCompare(String(right.id))
  })
}

function mergeTeamAssignments(preferredSnapshot, secondarySnapshot, validPlayerIds, validTeamIds) {
  const assignments = new Map()

  for (const snapshot of [secondarySnapshot, preferredSnapshot]) {
    for (const entry of getArray(snapshot?.teamAssignments)) {
      if (!Array.isArray(entry) || typeof entry[0] !== "string" || typeof entry[1] !== "string") {
        continue
      }

      if (!validPlayerIds.has(entry[0]) || !validTeamIds.has(entry[1])) {
        continue
      }

      assignments.set(entry[0], entry[1])
    }
  }

  return Array.from(assignments.entries()).sort((left, right) => left[0].localeCompare(right[0]))
}

function mergeProcessedHostCommands(preferredSnapshot, secondarySnapshot) {
  const commands = new Set()
  for (const snapshot of [secondarySnapshot, preferredSnapshot]) {
    for (const requestId of getArray(snapshot?.processedHostCommands)) {
      if (typeof requestId === "string" && requestId.length > 0) {
        commands.add(requestId)
      }
    }
  }

  return Array.from(commands).sort((left, right) => left.localeCompare(right))
}

function pickFresherEvent(current, candidate) {
  if (!isObject(current)) {
    return cloneJson(candidate)
  }

  if (!isObject(candidate)) {
    return cloneJson(current)
  }

  return compareTuple(getEventFreshnessScore(candidate), getEventFreshnessScore(current)) >= 0
    ? cloneJson(candidate)
    : cloneJson(current)
}

function mergeProcessedPlayerSubmit(preferredSnapshot, secondarySnapshot, roomId) {
  const processed = new Map()

  for (const snapshot of [secondarySnapshot, preferredSnapshot]) {
    for (const entry of getArray(snapshot?.processedPlayerSubmit)) {
      if (!Array.isArray(entry) || typeof entry[0] !== "string" || !isObject(entry[1])) {
        continue
      }

      if (typeof roomId === "string" && roomId.length > 0 && entry[1].roomId !== roomId) {
        continue
      }

      const existing = processed.get(entry[0])
      processed.set(entry[0], pickFresherEvent(existing, entry[1]))
    }
  }

  return Array.from(processed.entries()).sort((left, right) => left[0].localeCompare(right[0]))
}

function mergeRoomEvents(preferredSnapshot, secondarySnapshot, roomId) {
  const eventsById = new Map()

  for (const snapshot of [secondarySnapshot, preferredSnapshot]) {
    for (const event of getArray(snapshot?.roomEvents)) {
      if (!isObject(event) || typeof event.id !== "string") {
        continue
      }

      if (typeof roomId === "string" && roomId.length > 0 && event.roomId !== roomId) {
        continue
      }

      const existing = eventsById.get(event.id)
      eventsById.set(event.id, pickFresherEvent(existing, event))
    }
  }

  return Array.from(eventsById.values())
    .sort((left, right) => {
      const freshnessDiff = compareTuple(getEventFreshnessScore(left), getEventFreshnessScore(right))
      if (freshnessDiff !== 0) {
        return freshnessDiff
      }

      return String(left.id).localeCompare(String(right.id))
    })
    .slice(-MAX_MERGED_ROOM_EVENTS)
}

function mergeRoomRecord(preferredSnapshot, secondarySnapshot, latestActivityAt, hostLastSeenAt) {
  const preferredRoom = isObject(preferredSnapshot?.room) ? preferredSnapshot.room : null
  const secondaryRoom = isObject(secondarySnapshot?.room) ? secondarySnapshot.room : null
  if (!preferredRoom && !secondaryRoom) {
    return null
  }

  if (!preferredRoom) {
    const merged = cloneJson(secondaryRoom)
    merged.updatedAt = Math.max(getFiniteNumber(merged.updatedAt), latestActivityAt, getFiniteNumber(hostLastSeenAt))
    return merged
  }

  if (!secondaryRoom) {
    const merged = cloneJson(preferredRoom)
    merged.updatedAt = Math.max(getFiniteNumber(merged.updatedAt), latestActivityAt, getFiniteNumber(hostLastSeenAt))
    return merged
  }

  const preferredCreatedAt = getFiniteNumber(preferredRoom.createdAt)
  const secondaryCreatedAt = getFiniteNumber(secondaryRoom.createdAt)
  const createdAtCandidates = [preferredCreatedAt, secondaryCreatedAt].filter((value) => value > 0)

  return {
    ...cloneJson(secondaryRoom),
    ...cloneJson(preferredRoom),
    version: Math.max(getFiniteNumber(preferredRoom.version), getFiniteNumber(secondaryRoom.version)),
    createdAt: createdAtCandidates.length > 0 ? Math.min(...createdAtCandidates) : 0,
    updatedAt: Math.max(
      getFiniteNumber(preferredRoom.updatedAt),
      getFiniteNumber(secondaryRoom.updatedAt),
      latestActivityAt,
      getFiniteNumber(hostLastSeenAt)
    ),
  }
}

export function mergeRoomShardSnapshots(existingSnapshot, incomingSnapshot) {
  if (!isRoomShardSnapshotLike(existingSnapshot)) {
    return cloneJson(incomingSnapshot)
  }

  if (!isRoomShardSnapshotLike(incomingSnapshot)) {
    return cloneJson(existingSnapshot)
  }

  const existingRoomId = getRoomSnapshotRoomId(existingSnapshot)
  const incomingRoomId = getRoomSnapshotRoomId(incomingSnapshot)
  if (existingRoomId && incomingRoomId && existingRoomId !== incomingRoomId) {
    return cloneJson(incomingSnapshot)
  }

  const roomId = incomingRoomId ?? existingRoomId ?? null
  const preferredIsIncoming = compareSnapshotFreshness(incomingSnapshot, existingSnapshot) >= 0
  const preferredSnapshot = preferredIsIncoming ? incomingSnapshot : existingSnapshot
  const secondarySnapshot = preferredIsIncoming ? existingSnapshot : incomingSnapshot

  const mergedPlayers = mergePlayers(preferredSnapshot, secondarySnapshot, roomId)
  const mergedTeams = mergeTeams(preferredSnapshot, secondarySnapshot, roomId)
  const validPlayerIds = new Set(mergedPlayers.map((player) => player.id))
  const validTeamIds = new Set(mergedTeams.map((team) => team.id))
  const mergedAssignments = mergeTeamAssignments(
    preferredSnapshot,
    secondarySnapshot,
    validPlayerIds,
    validTeamIds
  )
  const mergedRoomEvents = mergeRoomEvents(preferredSnapshot, secondarySnapshot, roomId)
  const mergedHostLastSeenAt = Math.max(
    getFiniteNumber(preferredSnapshot.hostLastSeenAt),
    getFiniteNumber(secondarySnapshot.hostLastSeenAt)
  )
  const latestActivityAt = Math.max(
    getSnapshotLatestActivityAt(preferredSnapshot),
    getSnapshotLatestActivityAt(secondarySnapshot),
    ...mergedPlayers.map((player) => getPlayerActivityAt(player)),
    ...mergedRoomEvents.map((event) => getFiniteNumber(event.createdAt))
  )

  return {
    room: mergeRoomRecord(preferredSnapshot, secondarySnapshot, latestActivityAt, mergedHostLastSeenAt),
    players: mergedPlayers,
    teams: mergedTeams,
    teamAssignments: mergedAssignments,
    trivia:
      preferredSnapshot.trivia !== undefined && preferredSnapshot.trivia !== null
        ? cloneJson(preferredSnapshot.trivia)
        : cloneJson(secondarySnapshot.trivia ?? null),
    haraj:
      preferredSnapshot.haraj !== undefined && preferredSnapshot.haraj !== null
        ? cloneJson(preferredSnapshot.haraj)
        : cloneJson(secondarySnapshot.haraj ?? null),
    hostLastSeenAt: mergedHostLastSeenAt > 0 ? mergedHostLastSeenAt : null,
    pausedFromState:
      preferredSnapshot.pausedFromState ?? secondarySnapshot.pausedFromState ?? null,
    processedHostCommands: mergeProcessedHostCommands(preferredSnapshot, secondarySnapshot),
    processedPlayerSubmit: mergeProcessedPlayerSubmit(preferredSnapshot, secondarySnapshot, roomId),
    roomEvents: mergedRoomEvents,
  }
}

export function mergeRoomStatePayloads(existingState, incomingState) {
  const existingPayload = isObject(existingState) ? existingState : null
  const incomingPayload = isObject(incomingState) ? incomingState : null
  if (!incomingPayload) {
    return cloneJson(existingPayload ?? {})
  }

  if (!isRoomShardSnapshotLike(incomingPayload.snapshot)) {
    return {
      ...(existingPayload ? cloneJson(existingPayload) : {}),
      ...cloneJson(incomingPayload),
    }
  }

  const mergedSnapshot = mergeRoomShardSnapshots(existingPayload?.snapshot, incomingPayload.snapshot)
  const mergedActivityAt = getSnapshotLatestActivityAt(mergedSnapshot)

  return {
    ...(existingPayload ? cloneJson(existingPayload) : {}),
    ...cloneJson(incomingPayload),
    snapshot: mergedSnapshot,
    updatedAt: Math.max(
      getFiniteNumber(existingPayload?.updatedAt),
      getFiniteNumber(incomingPayload.updatedAt),
      mergedActivityAt
    ),
  }
}

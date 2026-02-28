#!/usr/bin/env node

import { performance } from "node:perf_hooks"

function parsePositiveInt(raw, fallback) {
  if (!raw) {
    return fallback
  }
  const parsed = Number.parseInt(raw, 10)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback
  }
  return parsed
}

function parseArgs(argv) {
  const args = new Map()
  for (let index = 2; index < argv.length; index += 1) {
    const item = argv[index]
    if (!item.startsWith("--")) {
      continue
    }
    const [key, value] = item.split("=", 2)
    if (!key) {
      continue
    }
    args.set(key, value ?? "true")
  }
  return args
}

function readHostCredentials() {
  const rawJson = process.env.HOST_CREDENTIALS_JSON
  if (rawJson) {
    try {
      const parsed = JSON.parse(rawJson)
      if (Array.isArray(parsed)) {
        const normalized = parsed
          .filter((entry) => entry && typeof entry === "object")
          .map((entry) => {
            const candidate = entry
            return {
              username: typeof candidate.username === "string" ? candidate.username.trim() : "",
              password: typeof candidate.password === "string" ? candidate.password : "",
            }
          })
          .filter((entry) => entry.username.length > 0 && entry.password.length > 0)
        if (normalized.length > 0) {
          return normalized
        }
      }
    } catch {
      // Fall back to single-host credentials below.
    }
  }

  const username = process.env.HOST_USER ?? "host-demo"
  const password = process.env.HOST_PASS ?? "demo1234"
  return [{ username, password }]
}

function buildConfig() {
  const args = parseArgs(process.argv)
  const help = args.has("--help") || args.has("-h")
  if (help) {
    return { help: true }
  }

  const baseUrl = (args.get("--base-url") ?? process.env.BASE_URL ?? "").trim().replace(/\/+$/, "")
  const roomsRequested = parsePositiveInt(args.get("--rooms") ?? process.env.LOAD_ROOMS, 100)
  const playersPerRoom = parsePositiveInt(args.get("--players") ?? process.env.PLAYERS_PER_ROOM, 20)
  const loginConcurrency = parsePositiveInt(args.get("--login-concurrency") ?? process.env.LOGIN_CONCURRENCY, 20)
  const createConcurrency = parsePositiveInt(args.get("--create-concurrency") ?? process.env.CREATE_CONCURRENCY, 20)
  const roomConcurrency = parsePositiveInt(args.get("--room-concurrency") ?? process.env.ROOM_CONCURRENCY, 20)
  const endConcurrency = parsePositiveInt(args.get("--end-concurrency") ?? process.env.END_CONCURRENCY, 20)
  const joinConcurrencyPerRoom = parsePositiveInt(
    args.get("--join-concurrency") ?? process.env.JOIN_CONCURRENCY_PER_ROOM,
    5
  )
  const holdMs = parsePositiveInt(args.get("--hold-ms") ?? process.env.HOLD_MS, 15000)
  const timeoutMs = parsePositiveInt(args.get("--timeout-ms") ?? process.env.REQUEST_TIMEOUT_MS, 15000)

  return {
    help: false,
    baseUrl,
    roomsRequested: Math.min(roomsRequested, 100),
    playersPerRoom,
    loginConcurrency,
    createConcurrency,
    roomConcurrency,
    endConcurrency,
    joinConcurrencyPerRoom,
    holdMs,
    timeoutMs,
    hostCredentials: readHostCredentials(),
  }
}

function printUsage() {
  console.log("Usage:")
  console.log("  BASE_URL=https://<deployment> npm run load:rooms-100")
  console.log("")
  console.log("Optional env vars:")
  console.log("  HOST_CREDENTIALS_JSON='[{\"username\":\"h1\",\"password\":\"p1\"}, ...]'")
  console.log("  HOST_USER=host-demo HOST_PASS=demo1234")
  console.log("  LOAD_ROOMS=100 PLAYERS_PER_ROOM=20")
  console.log("  LOGIN_CONCURRENCY=20 CREATE_CONCURRENCY=20 ROOM_CONCURRENCY=20 END_CONCURRENCY=20")
  console.log("  JOIN_CONCURRENCY_PER_ROOM=5 HOLD_MS=15000 REQUEST_TIMEOUT_MS=15000")
  console.log("")
  console.log("Notes:")
  console.log("  - This script is intentionally capped at 100 rooms.")
  console.log("  - For truly concurrent 100 active rooms, provide at least 100 host credentials.")
}

function createRequestId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID()
  }
  return `req-${Date.now()}-${Math.floor(Math.random() * 100000)}`
}

function percentile(values, p) {
  if (!values.length) {
    return null
  }
  const sorted = [...values].sort((a, b) => a - b)
  const rank = Math.ceil((p / 100) * sorted.length)
  const index = Math.min(sorted.length - 1, Math.max(0, rank - 1))
  return sorted[index] ?? null
}

function summarizeLatency(values) {
  if (!values.length) {
    return null
  }

  const total = values.reduce((sum, value) => sum + value, 0)
  return {
    count: values.length,
    avg: total / values.length,
    p50: percentile(values, 50),
    p95: percentile(values, 95),
    p99: percentile(values, 99),
    max: Math.max(...values),
  }
}

function formatMs(value) {
  if (!Number.isFinite(value)) {
    return "n/a"
  }
  return `${value.toFixed(1)}ms`
}

async function mapWithConcurrency(items, concurrency, worker) {
  const results = new Array(items.length)
  let nextIndex = 0

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (true) {
      const current = nextIndex
      nextIndex += 1
      if (current >= items.length) {
        return
      }
      results[current] = await worker(items[current], current)
    }
  })

  await Promise.all(workers)
  return results
}

async function requestJson(baseUrl, path, options) {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), options.timeoutMs)

  try {
    const startedAt = performance.now()
    const response = await fetch(`${baseUrl}${path}`, {
      method: options.method,
      headers: {
        "content-type": "application/json",
        ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: controller.signal,
    })
    const latencyMs = performance.now() - startedAt
    const rawText = await response.text()
    const json = rawText ? JSON.parse(rawText) : null
    return {
      ok: response.ok,
      status: response.status,
      latencyMs,
      json,
    }
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return {
        ok: false,
        status: 408,
        latencyMs: options.timeoutMs,
        json: {
          error: {
            code: "REQUEST_TIMEOUT",
            message: `Request timed out after ${options.timeoutMs}ms`,
          },
        },
      }
    }
    return {
      ok: false,
      status: 599,
      latencyMs: 0,
      json: {
        error: {
          code: "REQUEST_FAILED",
          message: error instanceof Error ? error.message : "Unknown request error",
        },
      },
    }
  } finally {
    clearTimeout(timeoutId)
  }
}

async function loginHost(baseUrl, host, timeoutMs) {
  const response = await requestJson(baseUrl, "/api/auth/host/login", {
    method: "POST",
    timeoutMs,
    body: {
      username: host.username,
      password: host.password,
    },
  })

  if (!response.ok || !response.json?.token) {
    return {
      ok: false,
      message: `login failed (${host.username}) status=${response.status} code=${response.json?.error?.code ?? "n/a"}`,
      latencyMs: response.latencyMs,
    }
  }

  return {
    ok: true,
    username: host.username,
    token: response.json.token,
    hostId: response.json.host?.id ?? null,
    latencyMs: response.latencyMs,
  }
}

async function createRoom(baseUrl, token, timeoutMs) {
  let response = await requestJson(baseUrl, "/api/rooms/create", {
    method: "POST",
    timeoutMs,
    token,
  })

  if (response.status === 409 && response.json?.error?.code === "HOST_ALREADY_ACTIVE") {
    const activeRoomId = response.json?.error?.details?.activeRoomId
    if (typeof activeRoomId === "string" && activeRoomId.length > 0) {
      await requestJson(baseUrl, `/api/rooms/${activeRoomId}/end`, {
        method: "POST",
        timeoutMs,
        token,
      })
      response = await requestJson(baseUrl, "/api/rooms/create", {
        method: "POST",
        timeoutMs,
        token,
      })
    }
  }

  if (!response.ok || !response.json?.room?.roomId) {
    return {
      ok: false,
      message: `create room failed status=${response.status} code=${response.json?.error?.code ?? "n/a"}`,
      latencyMs: response.latencyMs,
    }
  }

  return {
    ok: true,
    roomId: response.json.room.roomId,
    latencyMs: response.latencyMs,
  }
}

async function sendHostAction(baseUrl, roomId, token, actionType, timeoutMs, payload = {}) {
  const response = await requestJson(baseUrl, `/api/rooms/${roomId}/actions`, {
    method: "POST",
    timeoutMs,
    token,
    body: {
      v: "v1",
      type: actionType,
      requestId: createRequestId(),
      payload,
    },
  })

  if (!response.ok) {
    return {
      ok: false,
      message: `${actionType} failed status=${response.status} code=${response.json?.error?.code ?? "n/a"}`,
      latencyMs: response.latencyMs,
    }
  }

  return {
    ok: true,
    latencyMs: response.latencyMs,
    json: response.json,
  }
}

async function joinPlayer(baseUrl, roomId, name, timeoutMs) {
  const response = await requestJson(baseUrl, `/api/rooms/${roomId}/join`, {
    method: "POST",
    timeoutMs,
    body: {
      name,
    },
  })

  if (!response.ok || !response.json?.player?.id) {
    return {
      ok: false,
      message: `join failed status=${response.status} code=${response.json?.error?.code ?? "n/a"}`,
      latencyMs: response.latencyMs,
    }
  }

  return {
    ok: true,
    latencyMs: response.latencyMs,
    playerId: response.json.player.id,
    playerToken: response.json.playerToken ?? null,
  }
}

async function getRoomState(baseUrl, roomId, token, timeoutMs) {
  const response = await requestJson(baseUrl, `/api/rooms/${roomId}/state`, {
    method: "GET",
    timeoutMs,
    token,
  })
  if (!response.ok || !response.json?.payload?.room) {
    return {
      ok: false,
      message: `state failed status=${response.status} code=${response.json?.error?.code ?? "n/a"}`,
      latencyMs: response.latencyMs,
      room: null,
    }
  }
  return {
    ok: true,
    latencyMs: response.latencyMs,
    room: response.json.payload.room,
  }
}

function printLatencySummary(label, values) {
  const summary = summarizeLatency(values)
  if (!summary) {
    console.log(`- ${label}: no samples`)
    return
  }

  console.log(
    `- ${label}: count=${summary.count} avg=${formatMs(summary.avg)} p50=${formatMs(summary.p50 ?? 0)} p95=${formatMs(summary.p95 ?? 0)} p99=${formatMs(summary.p99 ?? 0)} max=${formatMs(summary.max)}`
  )
}

async function main() {
  const config = buildConfig()
  if (config.help) {
    printUsage()
    return
  }

  if (!config.baseUrl) {
    console.error("BASE_URL is required (for example: https://your-deployment.example.com)")
    process.exitCode = 1
    return
  }

  const hostsNeeded = config.roomsRequested
  if (config.hostCredentials.length < hostsNeeded) {
    console.error(
      `Insufficient host credentials. rooms=${hostsNeeded} but only ${config.hostCredentials.length} credential(s) provided.`
    )
    console.error("Provide HOST_CREDENTIALS_JSON with at least one unique host per active room.")
    process.exitCode = 1
    return
  }

  console.log("== 100-room load canary ==")
  console.log(`BASE_URL=${config.baseUrl}`)
  console.log(`rooms=${config.roomsRequested} playersPerRoom=${config.playersPerRoom}`)
  console.log(
    `concurrency login/create/room/end=${config.loginConcurrency}/${config.createConcurrency}/${config.roomConcurrency}/${config.endConcurrency}`
  )
  console.log(`joinConcurrencyPerRoom=${config.joinConcurrencyPerRoom} holdMs=${config.holdMs} timeoutMs=${config.timeoutMs}`)

  const startedAt = performance.now()
  const metrics = {
    loginMs: [],
    createMs: [],
    joinMs: [],
    stateMs: [],
    endMs: [],
    actionMsByType: new Map(),
  }
  const errors = []

  const hostPool = config.hostCredentials.slice(0, hostsNeeded)

  console.log("\nPhase 1/5: host login")
  const loggedInHosts = await mapWithConcurrency(hostPool, config.loginConcurrency, async (host) => {
    const result = await loginHost(config.baseUrl, host, config.timeoutMs)
    if (result.ok) {
      metrics.loginMs.push(result.latencyMs)
    } else {
      errors.push(result.message)
    }
    return result
  })
  const readyHosts = loggedInHosts.filter((entry) => entry.ok)
  console.log(`Logged in: ${readyHosts.length}/${hostPool.length}`)
  if (readyHosts.length === 0) {
    console.error("No host login succeeded; aborting.")
    process.exitCode = 1
    return
  }

  console.log("\nPhase 2/5: create rooms")
  let activeRooms = 0
  let maxActiveRooms = 0
  const roomSlots = await mapWithConcurrency(readyHosts, config.createConcurrency, async (host, index) => {
    if (!host.ok) {
      return { ok: false, message: "login failed", hostIndex: index }
    }
    const created = await createRoom(config.baseUrl, host.token, config.timeoutMs)
    if (!created.ok) {
      errors.push(`host=${host.username} ${created.message}`)
      return { ok: false, message: created.message, hostIndex: index }
    }

    metrics.createMs.push(created.latencyMs)
    activeRooms += 1
    maxActiveRooms = Math.max(maxActiveRooms, activeRooms)

    return {
      ok: true,
      hostIndex: index,
      hostUsername: host.username,
      token: host.token,
      roomId: created.roomId,
    }
  })
  const createdRooms = roomSlots.filter((entry) => entry.ok)
  console.log(`Created rooms: ${createdRooms.length}`)
  console.log(`Max active rooms observed so far: ${maxActiveRooms}`)
  if (createdRooms.length === 0) {
    console.error("No room creation succeeded; aborting.")
    process.exitCode = 1
    return
  }

  console.log("\nPhase 3/5: room priming (joins + host actions)")
  const actionRecord = (actionType, latencyMs) => {
    if (!metrics.actionMsByType.has(actionType)) {
      metrics.actionMsByType.set(actionType, [])
    }
    metrics.actionMsByType.get(actionType).push(latencyMs)
  }

  await mapWithConcurrency(createdRooms, config.roomConcurrency, async (slot, slotIndex) => {
    if (!slot.ok) {
      return
    }

    const joinIndices = Array.from({ length: config.playersPerRoom }, (_, i) => i)
    const joined = await mapWithConcurrency(joinIndices, config.joinConcurrencyPerRoom, async (joinIndex) => {
      const name = `Load P${slotIndex + 1}-${joinIndex + 1}`
      const result = await joinPlayer(config.baseUrl, slot.roomId, name, config.timeoutMs)
      if (result.ok) {
        metrics.joinMs.push(result.latencyMs)
      } else {
        errors.push(`room=${slot.roomId} ${result.message}`)
      }
      return result
    })

    const successfulJoins = joined.filter((entry) => entry.ok).length
    if (successfulJoins === 0) {
      errors.push(`room=${slot.roomId} has 0 joined players; skipping action sequence`)
      return
    }

    for (const actionType of ["host.lockLobby", "host.startTeams", "host.startTrivia"]) {
      const action = await sendHostAction(config.baseUrl, slot.roomId, slot.token, actionType, config.timeoutMs)
      if (!action.ok) {
        errors.push(`room=${slot.roomId} ${action.message}`)
        return
      }
      actionRecord(actionType, action.latencyMs)
    }

    const state = await getRoomState(config.baseUrl, slot.roomId, slot.token, config.timeoutMs)
    if (!state.ok) {
      errors.push(`room=${slot.roomId} ${state.message}`)
      return
    }
    metrics.stateMs.push(state.latencyMs)

    const clueId = state.room?.trivia?.board?.[0]?.clues?.[0]?.questionId
    if (typeof clueId === "string" && clueId.length > 0) {
      const selectAction = await sendHostAction(
        config.baseUrl,
        slot.roomId,
        slot.token,
        "host.selectTriviaClue",
        config.timeoutMs,
        { questionId: clueId }
      )
      if (selectAction.ok) {
        actionRecord("host.selectTriviaClue", selectAction.latencyMs)
      } else {
        errors.push(`room=${slot.roomId} ${selectAction.message}`)
      }
    } else {
      errors.push(`room=${slot.roomId} no clue id available in state snapshot`)
    }
  })

  if (config.holdMs > 0) {
    console.log(`\nPhase 4/5: hold active rooms for ${config.holdMs}ms`)
    await new Promise((resolve) => setTimeout(resolve, config.holdMs))
  }

  console.log("\nPhase 5/5: end rooms")
  await mapWithConcurrency(createdRooms, config.endConcurrency, async (slot) => {
    if (!slot.ok) {
      return
    }
    const action = await sendHostAction(config.baseUrl, slot.roomId, slot.token, "host.endSession", config.timeoutMs)
    if (action.ok) {
      metrics.endMs.push(action.latencyMs)
      activeRooms = Math.max(0, activeRooms - 1)
    } else {
      errors.push(`room=${slot.roomId} ${action.message}`)
    }
  })

  const totalMs = performance.now() - startedAt
  console.log("\n== Summary ==")
  console.log(`Rooms requested: ${config.roomsRequested}`)
  console.log(`Rooms created: ${createdRooms.length}`)
  console.log(`Max concurrent active rooms observed: ${maxActiveRooms}`)
  console.log(`Errors captured: ${errors.length}`)
  console.log(`Total duration: ${formatMs(totalMs)}`)

  printLatencySummary("host.login", metrics.loginMs)
  printLatencySummary("rooms.create", metrics.createMs)
  printLatencySummary("players.join", metrics.joinMs)
  printLatencySummary("rooms.state", metrics.stateMs)
  printLatencySummary("host.endSession", metrics.endMs)
  for (const [actionType, values] of metrics.actionMsByType.entries()) {
    printLatencySummary(actionType, values)
  }

  if (errors.length > 0) {
    console.log("\nTop errors:")
    for (const message of errors.slice(0, 20)) {
      console.log(`- ${message}`)
    }
  }

  if (errors.length > 0) {
    process.exitCode = 1
  }
}

void main()

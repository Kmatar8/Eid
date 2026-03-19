#!/usr/bin/env node

const DEFAULT_BASE_URL = process.env.BASE_URL ?? "http://localhost:3000"
const DEFAULT_INTERVAL_MS = 5000

function printHelp() {
  console.log(`Usage: node scripts/monitor-activity.mjs [options]

Options:
  --base-url <url>              Base URL for the app. Default: ${DEFAULT_BASE_URL}
  --token <token>               Bearer token for /api/admin/activity.
  --watch                       Poll continuously.
  --interval-ms <ms>            Poll interval for --watch. Default: ${DEFAULT_INTERVAL_MS}
  --host-presence-ms <ms>       Override host presence threshold.
  --controller-presence-ms <ms> Override controller presence threshold.
  --json                        Print raw JSON.
  --help                        Show this help.

Environment:
  BASE_URL
  HROOF_ACTIVITY_MONITOR_TOKEN
`)
}

function parsePositiveInt(raw, label) {
  if (raw === undefined) {
    return undefined
  }

  const parsed = Number.parseInt(raw, 10)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Invalid ${label}: ${raw}`)
  }

  return parsed
}

function parseArgs(argv) {
  const parsed = {
    baseUrl: DEFAULT_BASE_URL,
    token: process.env.HROOF_ACTIVITY_MONITOR_TOKEN ?? "",
    watch: false,
    intervalMs: DEFAULT_INTERVAL_MS,
    json: false,
    hostPresenceMs: undefined,
    controllerPresenceMs: undefined,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === "--help") {
      parsed.help = true
      continue
    }

    if (arg === "--watch") {
      parsed.watch = true
      continue
    }

    if (arg === "--json") {
      parsed.json = true
      continue
    }

    const value = argv[index + 1]
    if (arg === "--base-url") {
      if (!value) {
        throw new Error("--base-url requires a value")
      }
      parsed.baseUrl = value
      index += 1
      continue
    }

    if (arg === "--token") {
      if (!value) {
        throw new Error("--token requires a value")
      }
      parsed.token = value
      index += 1
      continue
    }

    if (arg === "--interval-ms") {
      parsed.intervalMs = parsePositiveInt(value, "interval-ms")
      index += 1
      continue
    }

    if (arg === "--host-presence-ms") {
      parsed.hostPresenceMs = parsePositiveInt(value, "host-presence-ms")
      index += 1
      continue
    }

    if (arg === "--controller-presence-ms") {
      parsed.controllerPresenceMs = parsePositiveInt(value, "controller-presence-ms")
      index += 1
      continue
    }

    throw new Error(`Unknown argument: ${arg}`)
  }

  return parsed
}

function buildActivityUrl(options) {
  const normalizedBase = options.baseUrl.endsWith("/") ? options.baseUrl : `${options.baseUrl}/`
  const url = new URL("api/admin/activity", normalizedBase)
  if (options.hostPresenceMs) {
    url.searchParams.set("hostPresenceMs", String(options.hostPresenceMs))
  }
  if (options.controllerPresenceMs) {
    url.searchParams.set("controllerPresenceMs", String(options.controllerPresenceMs))
  }
  return url
}

function formatAge(ageMs) {
  if (ageMs === null || ageMs === undefined) {
    return "-"
  }

  if (ageMs < 1000) {
    return `${ageMs}ms`
  }

  const totalSeconds = Math.floor(ageMs / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  if (minutes <= 0) {
    return `${seconds}s`
  }

  return `${minutes}m ${seconds}s`
}

function printSummary(payload) {
  const observedAt = new Date(payload.observedAt).toISOString()
  console.log(`Observed: ${observedAt}`)
  console.log(
    `Hosts: present ${payload.summary.hosts.present}/${payload.summary.hosts.withActiveRoomAssignment} assigned`
  )
  console.log(
    `Rooms: active ${payload.summary.rooms.active}/${payload.summary.rooms.assigned} assigned`
  )
  console.log(
    `Controllers: active ${payload.summary.controllers.activeInActiveRooms}/${payload.summary.controllers.joinedInActiveRooms} joined`
  )

  const stateSummary = Object.entries(payload.summary.rooms.byState)
    .map(([state, count]) => `${state}:${count}`)
    .join(", ")
  if (stateSummary) {
    console.log(`Room states: ${stateSummary}`)
  }

  if (payload.rooms.length === 0) {
    console.log("No room assignments found.")
    return
  }

  console.log("")
  for (const room of payload.rooms) {
    const state = room.state ?? "missing"
    const activeGame = room.activeGame ?? "-"
    const hostState = room.hostPresent ? "present" : "stale"
    const roomState = room.roomActive ? "active" : room.roomFound ? "inactive" : "missing"
    console.log(
      [
        `room=${room.roomId || "-"}`,
        `host=${room.hostUsername}`,
        `roomState=${roomState}/${state}`,
        `game=${activeGame}`,
        `hostHeartbeat=${hostState}`,
        `hostAge=${formatAge(room.hostHeartbeatAgeMs)}`,
        `controllers=${room.activeControllers}/${room.joinedControllers}`,
      ].join("  ")
    )
  }
}

async function fetchActivity(options) {
  const url = buildActivityUrl(options)
  const response = await fetch(url, {
    headers: {
      authorization: `Bearer ${options.token}`,
    },
  })

  const text = await response.text()
  let payload = null
  try {
    payload = text ? JSON.parse(text) : null
  } catch {
    payload = text
  }

  if (!response.ok) {
    throw new Error(
      `Monitor request failed (${response.status}): ${
        typeof payload === "string" ? payload : JSON.stringify(payload)
      }`
    )
  }

  return payload
}

async function run(options) {
  if (!options.token) {
    throw new Error("Missing monitor token. Set HROOF_ACTIVITY_MONITOR_TOKEN or pass --token.")
  }

  do {
    const payload = await fetchActivity(options)
    if (options.json) {
      console.log(JSON.stringify(payload, null, 2))
    } else {
      printSummary(payload)
    }

    if (!options.watch) {
      break
    }

    console.log("")
    await new Promise((resolve) => setTimeout(resolve, options.intervalMs))
  } while (true)
}

try {
  const options = parseArgs(process.argv.slice(2))
  if (options.help) {
    printHelp()
    process.exit(0)
  }

  await run(options)
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}

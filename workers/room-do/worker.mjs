import { DurableObject } from "cloudflare:workers"

import { mergeRoomStatePayloads } from "./state-merge.mjs"

const ROOM_STATE_KEY = "room_state"
const ROOM_LAST_EVENT_KEY = "room_last_event"
const ROOM_ALARM_QUEUE_KEY = "room_alarm_queue"

function safeJsonParse(text, fallback) {
  try {
    return JSON.parse(text)
  } catch {
    return fallback
  }
}

function makeEventEnvelope(type, payload = {}, details = {}) {
  return {
    type,
    payload,
    ts: Date.now(),
    ...details,
  }
}

function normalizeAlarmQueue(value) {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .filter((item) => item && typeof item === "object")
    .map((item) => {
      const candidate = item
      const id = typeof candidate.id === "string" ? candidate.id : `alarm_${Math.random().toString(36).slice(2)}`
      const at = typeof candidate.at === "number" ? candidate.at : 0
      const type = typeof candidate.type === "string" ? candidate.type : "unknown"
      const payload = candidate.payload && typeof candidate.payload === "object" ? candidate.payload : {}
      return { id, at, type, payload }
    })
    .filter((item) => Number.isFinite(item.at) && item.at > 0)
    .sort((a, b) => a.at - b.at)
}

export class RoomDurableObject extends DurableObject {
  async readStatePayload() {
    const state = await this.ctx.storage.get(ROOM_STATE_KEY)
    return state ?? { initialized: true }
  }

  async readAlarmQueue() {
    const raw = await this.ctx.storage.get(ROOM_ALARM_QUEUE_KEY)
    return normalizeAlarmQueue(raw)
  }

  async writeAlarmQueue(queue) {
    const normalized = normalizeAlarmQueue(queue)
    await this.ctx.storage.put(ROOM_ALARM_QUEUE_KEY, normalized)

    if (normalized.length > 0) {
      await this.ctx.storage.setAlarm(normalized[0].at)
    } else {
      await this.ctx.storage.deleteAlarm()
    }
  }

  broadcast(payload) {
    const encoded = JSON.stringify(payload)
    for (const socket of this.ctx.getWebSockets()) {
      try {
        socket.send(encoded)
      } catch {
        // Best-effort fanout.
      }
    }
  }

  async publish(type, payload = {}, details = {}) {
    const envelope = makeEventEnvelope(type, payload, details)
    await this.ctx.storage.put(ROOM_LAST_EVENT_KEY, envelope)
    this.broadcast(envelope)
    return envelope
  }

  async handleStateGet() {
    const state = await this.readStatePayload()
    return new Response(JSON.stringify(state), {
      headers: { "content-type": "application/json; charset=utf-8" },
    })
  }

  async handleStatePost(request) {
    let body = {}
    try {
      body = await request.json()
    } catch {
      body = {}
    }

    const currentState = await this.readStatePayload()
    const nextState = mergeRoomStatePayloads(currentState, body)

    await this.ctx.storage.put(ROOM_STATE_KEY, nextState)
    await this.publish("room.state.persisted", { hasSnapshot: Boolean(nextState && nextState.snapshot !== undefined) })
    return new Response(JSON.stringify({ ok: true, snapshot: nextState?.snapshot ?? null }), {
      headers: { "content-type": "application/json; charset=utf-8" },
    })
  }

  async handlePublishPost(request) {
    let body = {}
    try {
      body = await request.json()
    } catch {
      body = {}
    }

    const eventType = typeof body.type === "string" ? body.type : "room.update"
    const payload = body.payload && typeof body.payload === "object" ? body.payload : {}
    const details = body.details && typeof body.details === "object" ? body.details : {}
    const envelope = await this.publish(eventType, payload, details)
    return new Response(
      JSON.stringify({
        ok: true,
        event: envelope,
        subscribers: this.ctx.getWebSockets().length,
      }),
      {
        headers: { "content-type": "application/json; charset=utf-8" },
      }
    )
  }

  async handleAlarmGet() {
    const queue = await this.readAlarmQueue()
    return new Response(JSON.stringify({ queue }), {
      headers: { "content-type": "application/json; charset=utf-8" },
    })
  }

  async handleAlarmPost(request) {
    let body = {}
    try {
      body = await request.json()
    } catch {
      body = {}
    }

    const at = typeof body.at === "number" ? body.at : NaN
    const type = typeof body.type === "string" ? body.type : ""
    if (!Number.isFinite(at) || at <= 0 || !type) {
      return new Response(JSON.stringify({ ok: false, error: "INVALID_ALARM_INPUT" }), {
        status: 400,
        headers: { "content-type": "application/json; charset=utf-8" },
      })
    }

    const queue = await this.readAlarmQueue()
    const nextAlarm = {
      id: typeof body.id === "string" ? body.id : `alarm_${Math.random().toString(36).slice(2)}`,
      at,
      type,
      payload: body.payload && typeof body.payload === "object" ? body.payload : {},
    }
    queue.push(nextAlarm)
    await this.writeAlarmQueue(queue)
    await this.publish("room.alarm.scheduled", nextAlarm)

    return new Response(JSON.stringify({ ok: true, alarm: nextAlarm }), {
      headers: { "content-type": "application/json; charset=utf-8" },
    })
  }

  async handleAlarmDelete(url) {
    const id = url.searchParams.get("id")
    if (!id) {
      return new Response(JSON.stringify({ ok: false, error: "MISSING_ALARM_ID" }), {
        status: 400,
        headers: { "content-type": "application/json; charset=utf-8" },
      })
    }

    const queue = await this.readAlarmQueue()
    const filtered = queue.filter((alarm) => alarm.id !== id)
    await this.writeAlarmQueue(filtered)
    await this.publish("room.alarm.cancelled", { id })

    return new Response(JSON.stringify({ ok: true, removed: queue.length - filtered.length }), {
      headers: { "content-type": "application/json; charset=utf-8" },
    })
  }

  async handleWebSocketUpgrade(request) {
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
      return new Response("Expected websocket upgrade", { status: 426 })
    }

    const pair = new WebSocketPair()
    const [client, server] = Object.values(pair)
    this.ctx.acceptWebSocket(server)

    const state = await this.readStatePayload()
    const lastEvent = (await this.ctx.storage.get(ROOM_LAST_EVENT_KEY)) ?? null
    try {
      server.send(
        JSON.stringify({
          type: "room.sync",
          payload: {
            state,
            lastEvent,
          },
          ts: Date.now(),
        })
      )
    } catch {
      // Ignore transient send failure on initial sync.
    }

    return new Response(null, { status: 101, webSocket: client })
  }

  async fetch(request) {
    const url = new URL(request.url)

    if (request.method === "GET" && url.pathname === "/health") {
      return new Response(JSON.stringify({ ok: true, durableObject: "RoomDurableObject" }), {
        headers: { "content-type": "application/json; charset=utf-8" },
      })
    }

    if (request.method === "GET" && url.pathname === "/state") {
      return this.handleStateGet()
    }

    if (request.method === "POST" && url.pathname === "/state") {
      return this.handleStatePost(request)
    }

    if (request.method === "POST" && url.pathname === "/publish") {
      return this.handlePublishPost(request)
    }

    if (request.method === "GET" && url.pathname === "/alarm") {
      return this.handleAlarmGet()
    }

    if (request.method === "POST" && url.pathname === "/alarm") {
      return this.handleAlarmPost(request)
    }

    if (request.method === "DELETE" && url.pathname === "/alarm") {
      return this.handleAlarmDelete(url)
    }

    if (request.method === "GET" && url.pathname === "/ws") {
      return this.handleWebSocketUpgrade(request)
    }

    return new Response("Not found", { status: 404 })
  }

  webSocketMessage(ws, message) {
    const text = typeof message === "string" ? message : new TextDecoder().decode(message)
    const data = safeJsonParse(text, {})
    const type = typeof data.type === "string" ? data.type : ""

    if (type === "ping") {
      try {
        ws.send(JSON.stringify(makeEventEnvelope("pong", {})))
      } catch {
        // Best effort.
      }
      return
    }

    if (type === "publish") {
      const payload = data.payload && typeof data.payload === "object" ? data.payload : {}
      const details = data.details && typeof data.details === "object" ? data.details : {}
      void this.publish(typeof data.eventType === "string" ? data.eventType : "room.update", payload, details)
    }
  }

  async alarm() {
    const now = Date.now()
    const queue = await this.readAlarmQueue()
    const due = queue.filter((alarm) => alarm.at <= now)
    const pending = queue.filter((alarm) => alarm.at > now)

    await this.writeAlarmQueue(pending)
    if (due.length > 0) {
      await this.publish("room.alarm.fired", {
        alarms: due,
      })
    }
  }
}

const workerEntrypoint = {
  fetch() {
    return new Response("hroof-room-do worker", { status: 200 })
  },
}

export default workerEntrypoint

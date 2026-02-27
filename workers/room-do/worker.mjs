import { DurableObject } from "cloudflare:workers"

export class RoomDurableObject extends DurableObject {
  async fetch(request) {
    const url = new URL(request.url)

    if (request.method === "GET" && url.pathname === "/health") {
      return new Response(JSON.stringify({ ok: true, durableObject: "RoomDurableObject" }), {
        headers: { "content-type": "application/json; charset=utf-8" },
      })
    }

    if (request.method === "GET" && url.pathname === "/state") {
      const state = (await this.ctx.storage.get("room_state")) ?? { initialized: true }
      return new Response(JSON.stringify(state), {
        headers: { "content-type": "application/json; charset=utf-8" },
      })
    }

    if (request.method === "POST" && url.pathname === "/state") {
      let body = {}
      try {
        body = await request.json()
      } catch {
        body = {}
      }

      await this.ctx.storage.put("room_state", body)
      return new Response(JSON.stringify({ ok: true }), {
        headers: { "content-type": "application/json; charset=utf-8" },
      })
    }

    return new Response("Not found", { status: 404 })
  }
}

export default {
  fetch() {
    return new Response("hroof-room-do worker", { status: 200 })
  },
}

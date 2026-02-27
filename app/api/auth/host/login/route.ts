import { authenticateHost } from "@/lib/server/store"
import { errorResponse, jsonResponse, safeJson } from "@/lib/server/http"
import { withSharedStore } from "@/lib/server/store-sync"
import { signToken } from "@/lib/server/token"

export const runtime = "nodejs"

type LoginBody = {
  username?: string
  password?: string
}

export async function POST(request: Request) {
  return withSharedStore(async () => {
    const body = await safeJson<LoginBody>(request)
    if (!body) {
      return errorResponse(400, "BAD_JSON", "Request body must be valid JSON")
    }

    const username = typeof body.username === "string" ? body.username.trim() : ""
    const password = typeof body.password === "string" ? body.password : ""

    if (!username || !password) {
      return errorResponse(400, "VALIDATION_ERROR", "username and password are required")
    }

    const host = authenticateHost(username, password)
    if (!host) {
      return errorResponse(401, "INVALID_CREDENTIALS", "Invalid host username or password")
    }

    const token = signToken({
      sub: host.id,
      role: "host",
      hostId: host.id,
      username: host.username,
    })

    return jsonResponse(200, {
      token,
      host: {
        id: host.id,
        username: host.username,
      },
    })
  })
}

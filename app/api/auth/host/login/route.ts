import { authenticateHostAccessCode } from "@/lib/server/host-access-code-auth"
import { errorResponse, jsonResponse, safeJson } from "@/lib/server/http"
import { authenticateHost, resolveHostTokenTtlSeconds, upsertHostCredentialRecord } from "@/lib/server/store"
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

    const dbAuthResult = await authenticateHostAccessCode(username, password)
    let host: ReturnType<typeof authenticateHost> = null
    if (dbAuthResult.ok) {
      host = upsertHostCredentialRecord({
        username: dbAuthResult.code,
        passwordHash: dbAuthResult.passwordHash,
        accessExpiresAt: dbAuthResult.accessExpiresAt,
      })
    } else if (dbAuthResult.reason === "DB_UNAVAILABLE") {
      host = authenticateHost(username, password)
    } else if (dbAuthResult.reason === "DB_ERROR") {
      return errorResponse(503, "AUTH_STORE_UNAVAILABLE", "Credential database is temporarily unavailable")
    } else if (dbAuthResult.reason === "ACCESS_EXPIRED") {
      return errorResponse(403, "HOST_ACCESS_REVOKED", "Host access is revoked or expired")
    }

    if (!host) {
      return errorResponse(401, "INVALID_CREDENTIALS", "Invalid host code or password")
    }

    const tokenTtlSeconds = resolveHostTokenTtlSeconds(host)
    if (tokenTtlSeconds <= 0) {
      return errorResponse(403, "HOST_ACCESS_REVOKED", "Host access is revoked or expired")
    }

    const token = signToken({
      sub: host.id,
      role: "host",
      hostId: host.id,
      username: host.username,
    }, tokenTtlSeconds)

    return jsonResponse(200, {
      token,
      host: {
        id: host.id,
        username: host.username,
        email: host.email,
      },
    })
  })
}

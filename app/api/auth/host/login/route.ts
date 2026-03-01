import { authenticateHostAccessCode } from "@/lib/server/host-access-code-auth"
import { errorResponse, jsonResponse, safeJson } from "@/lib/server/http"
import { authenticateHost, resolveHostTokenTtlSeconds } from "@/lib/server/store"
import { withSharedStore } from "@/lib/server/store-sync"
import { signToken } from "@/lib/server/token"

export const runtime = "nodejs"

type LoginBody = {
  username?: string
  password?: string
}

function resolveTtlFromAccessExpiry(accessExpiresAt: number) {
  const remainingSeconds = Math.floor((accessExpiresAt - Date.now()) / 1000)
  if (remainingSeconds <= 0) {
    return 0
  }

  const defaultTtlSeconds = 60 * 60 * 12
  return Math.min(defaultTtlSeconds, remainingSeconds)
}

export async function POST(request: Request) {
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
  if (dbAuthResult.ok) {
    const tokenTtlSeconds = resolveTtlFromAccessExpiry(dbAuthResult.accessExpiresAt)
    if (tokenTtlSeconds <= 0) {
      return errorResponse(403, "HOST_ACCESS_REVOKED", "Host access is revoked or expired")
    }

    const token = signToken(
      {
        sub: dbAuthResult.hostId,
        role: "host",
        hostId: dbAuthResult.hostId,
        sessionId: dbAuthResult.sessionId,
        username: dbAuthResult.code,
      },
      tokenTtlSeconds
    )

    return jsonResponse(200, {
      token,
      host: {
        id: dbAuthResult.hostId,
        username: dbAuthResult.code,
        email: null,
      },
    })
  }

  if (dbAuthResult.reason === "DB_ERROR") {
    return errorResponse(503, "AUTH_STORE_UNAVAILABLE", "Credential database is temporarily unavailable")
  }

  if (dbAuthResult.reason === "ACCESS_EXPIRED") {
    return errorResponse(403, "HOST_ACCESS_REVOKED", "Host access is revoked or expired")
  }

  if (dbAuthResult.reason === "NOT_ACTIVATED") {
    return errorResponse(409, "HOST_CODE_NOT_ACTIVATED", "Host code requires activation")
  }

  if (
    dbAuthResult.reason !== "DB_UNAVAILABLE" &&
    dbAuthResult.reason !== "CREDENTIAL_NOT_FOUND" &&
    dbAuthResult.reason !== "INVALID_PASSWORD"
  ) {
    return errorResponse(500, "AUTH_FLOW_ERROR", "Unexpected host auth state")
  }

  if (dbAuthResult.reason !== "DB_UNAVAILABLE") {
    return errorResponse(401, "INVALID_CREDENTIALS", "Invalid host code or password")
  }

  return withSharedStore(async () => {
    const hostAuth = authenticateHost(username, password)
    if (!hostAuth.ok) {
      if (hostAuth.reason === "NOT_ACTIVATED") {
        return errorResponse(409, "HOST_CODE_NOT_ACTIVATED", "Host code requires activation")
      }

      if (hostAuth.reason === "ACCESS_EXPIRED") {
        return errorResponse(403, "HOST_ACCESS_REVOKED", "Host access is revoked or expired")
      }

      return errorResponse(401, "INVALID_CREDENTIALS", "Invalid host code or password")
    }

    const tokenTtlSeconds = resolveHostTokenTtlSeconds(hostAuth.host)
    if (tokenTtlSeconds <= 0) {
      return errorResponse(403, "HOST_ACCESS_REVOKED", "Host access is revoked or expired")
    }

    const token = signToken(
      {
        sub: hostAuth.host.id,
        role: "host",
        hostId: hostAuth.host.id,
        sessionId: hostAuth.sessionId,
        username: hostAuth.host.username,
      },
      tokenTtlSeconds
    )

    return jsonResponse(200, {
      token,
      host: {
        id: hostAuth.host.id,
        username: hostAuth.host.username,
        email: hostAuth.host.email,
      },
    })
  })
}

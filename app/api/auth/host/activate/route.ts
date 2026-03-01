import { activateHostAccessCode } from "@/lib/server/host-access-code-auth"
import { errorResponse, jsonResponse, safeJson } from "@/lib/server/http"
import { activateHost, resolveHostTokenTtlSeconds } from "@/lib/server/store"
import { withSharedStore } from "@/lib/server/store-sync"
import { signToken } from "@/lib/server/token"

export const runtime = "nodejs"

type ActivateBody = {
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
  const body = await safeJson<ActivateBody>(request)
  if (!body) {
    return errorResponse(400, "BAD_JSON", "Request body must be valid JSON")
  }

  const username = typeof body.username === "string" ? body.username.trim() : ""
  const password = typeof body.password === "string" ? body.password : ""

  if (!username || !password) {
    return errorResponse(400, "VALIDATION_ERROR", "username and password are required")
  }

  const dbActivation = await activateHostAccessCode(username, password)
  if (dbActivation.ok) {
    const tokenTtlSeconds = resolveTtlFromAccessExpiry(dbActivation.accessExpiresAt)
    if (tokenTtlSeconds <= 0) {
      return errorResponse(403, "HOST_ACCESS_REVOKED", "Host access is revoked or expired")
    }

    const token = signToken(
      {
        sub: dbActivation.hostId,
        role: "host",
        hostId: dbActivation.hostId,
        sessionId: dbActivation.sessionId,
        username: dbActivation.code,
      },
      tokenTtlSeconds
    )

    return jsonResponse(200, {
      token,
      host: {
        id: dbActivation.hostId,
        username: dbActivation.code,
        email: null,
      },
    })
  }

  if (dbActivation.reason === "DB_ERROR") {
    return errorResponse(503, "AUTH_STORE_UNAVAILABLE", "Credential database is temporarily unavailable")
  }

  if (dbActivation.reason === "ACCESS_EXPIRED") {
    return errorResponse(403, "HOST_ACCESS_REVOKED", "Host access is revoked or expired")
  }

  if (dbActivation.reason === "ALREADY_ACTIVATED") {
    return errorResponse(409, "HOST_CODE_ALREADY_ACTIVATED", "Host code is already activated")
  }

  if (dbActivation.reason !== "DB_UNAVAILABLE") {
    return errorResponse(401, "INVALID_CREDENTIALS", "Invalid host code")
  }

  return withSharedStore(async () => {
    const activation = activateHost(username, password)
    if (!activation.ok) {
      if (activation.reason === "ACCESS_EXPIRED") {
        return errorResponse(403, "HOST_ACCESS_REVOKED", "Host access is revoked or expired")
      }

      if (activation.reason === "ALREADY_ACTIVATED") {
        return errorResponse(409, "HOST_CODE_ALREADY_ACTIVATED", "Host code is already activated")
      }

      return errorResponse(401, "INVALID_CREDENTIALS", "Invalid host code")
    }

    const tokenTtlSeconds = resolveHostTokenTtlSeconds(activation.host)
    if (tokenTtlSeconds <= 0) {
      return errorResponse(403, "HOST_ACCESS_REVOKED", "Host access is revoked or expired")
    }

    const token = signToken(
      {
        sub: activation.host.id,
        role: "host",
        hostId: activation.host.id,
        sessionId: activation.sessionId,
        username: activation.host.username,
      },
      tokenTtlSeconds
    )

    return jsonResponse(200, {
      token,
      host: {
        id: activation.host.id,
        username: activation.host.username,
        email: activation.host.email,
      },
    })
  })
}

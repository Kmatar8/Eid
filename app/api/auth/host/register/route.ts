import { errorResponse, jsonResponse, safeJson } from "@/lib/server/http"
import { registerHostFromRedeem, resolveHostTokenTtlSeconds } from "@/lib/server/store"
import { withSharedStore } from "@/lib/server/store-sync"
import { isHostSetupToken, signToken, verifyToken } from "@/lib/server/token"

export const runtime = "nodejs"

type RegisterBody = {
  setupToken?: string
  email?: string
  username?: string
  password?: string
}

function normalizeEmail(value: string) {
  return value.trim().toLowerCase()
}

function isValidUsername(value: string) {
  return /^[a-zA-Z0-9._-]{3,32}$/.test(value)
}

function isValidPassword(value: string) {
  return value.length >= 8
}

export async function POST(request: Request) {
  return withSharedStore(async () => {
    const body = await safeJson<RegisterBody>(request)
    if (!body) {
      return errorResponse(400, "BAD_JSON", "Request body must be valid JSON")
    }

    const setupToken = typeof body.setupToken === "string" ? body.setupToken : ""
    const email = typeof body.email === "string" ? normalizeEmail(body.email) : ""
    const username = typeof body.username === "string" ? body.username.trim() : ""
    const password = typeof body.password === "string" ? body.password : ""

    if (!setupToken || !email || !username || !password) {
      return errorResponse(400, "VALIDATION_ERROR", "setupToken, email, username, and password are required")
    }

    if (!isValidUsername(username)) {
      return errorResponse(
        400,
        "USERNAME_INVALID",
        "username must be 3-32 chars and can only include letters, numbers, dot, underscore, or hyphen"
      )
    }

    if (!isValidPassword(password)) {
      return errorResponse(400, "PASSWORD_TOO_WEAK", "password must be at least 8 characters")
    }

    const setupClaims = verifyToken(setupToken)
    if (!isHostSetupToken(setupClaims)) {
      return errorResponse(401, "INVALID_SETUP_TOKEN", "setup token is invalid or expired")
    }

    const registerResult = registerHostFromRedeem({
      redeemCodeHash: setupClaims.redeemCodeHash,
      email,
      username,
      password,
    })

    if (!registerResult.ok) {
      if (registerResult.code === "USERNAME_TAKEN" || registerResult.code === "EMAIL_TAKEN") {
        return errorResponse(409, registerResult.code, "Host account already exists")
      }

      if (registerResult.code === "REDEEM_EMAIL_MISMATCH") {
        return errorResponse(400, registerResult.code, "Redeem code email mismatch")
      }

      if (registerResult.code === "REDEEM_CODE_NOT_FOUND") {
        return errorResponse(404, registerResult.code, "Redeem code not found")
      }

      if (registerResult.code === "REDEEM_CODE_ALREADY_REDEEMED") {
        return errorResponse(409, registerResult.code, "Redeem code was already used")
      }

      return errorResponse(409, registerResult.code, "Redeem code is expired")
    }

    const tokenTtlSeconds = resolveHostTokenTtlSeconds(registerResult.host)
    if (tokenTtlSeconds <= 0) {
      return errorResponse(403, "HOST_ACCESS_REVOKED", "Host access is revoked or expired")
    }

    const token = signToken({
      sub: registerResult.host.id,
      role: "host",
      hostId: registerResult.host.id,
      username: registerResult.host.username,
      email: registerResult.host.email ?? undefined,
    }, tokenTtlSeconds)

    return jsonResponse(201, {
      token,
      host: {
        id: registerResult.host.id,
        username: registerResult.host.username,
        email: registerResult.host.email,
      },
    })
  })
}

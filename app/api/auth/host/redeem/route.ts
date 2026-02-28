import { redeemHostCode } from "@/lib/server/store"
import { errorResponse, jsonResponse, safeJson } from "@/lib/server/http"
import { withSharedStore } from "@/lib/server/store-sync"
import { signToken } from "@/lib/server/token"

export const runtime = "nodejs"

const SETUP_TOKEN_TTL_SECONDS = 10 * 60

type RedeemBody = {
  code?: string
}

export async function POST(request: Request) {
  return withSharedStore(async () => {
    const body = await safeJson<RedeemBody>(request)
    if (!body) {
      return errorResponse(400, "BAD_JSON", "Request body must be valid JSON")
    }

    const code = typeof body.code === "string" ? body.code.trim() : ""
    if (!code) {
      return errorResponse(400, "VALIDATION_ERROR", "code is required")
    }

    const result = redeemHostCode(code)
    if (!result.ok) {
      if (result.code === "REDEEM_CODE_NOT_FOUND") {
        return errorResponse(404, result.code, "Redeem code not found")
      }

      if (result.code === "REDEEM_CODE_ALREADY_REDEEMED") {
        return errorResponse(409, result.code, "Redeem code was already used")
      }

      return errorResponse(409, result.code, "Redeem code is expired")
    }

    const setupToken = signToken(
      {
        sub: `host_setup:${result.redeemCodeHash}`,
        role: "host_setup",
        redeemCodeHash: result.redeemCodeHash,
      },
      SETUP_TOKEN_TTL_SECONDS
    )

    return jsonResponse(200, {
      setupToken,
      prefillEmail: result.email,
      expiresInSeconds: SETUP_TOKEN_TTL_SECONDS,
    })
  })
}

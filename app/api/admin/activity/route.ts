import { getRuntimeActivitySummary } from "@/lib/server/activity-monitor"
import { errorResponse, getBearerToken, jsonResponse } from "@/lib/server/http"

export const runtime = "nodejs"

const MONITOR_TOKEN_ENV_NAME = "HROOF_ACTIVITY_MONITOR_TOKEN"

function parsePositiveInt(raw: string | null) {
  if (!raw) {
    return undefined
  }

  const parsed = Number.parseInt(raw, 10)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return undefined
  }

  return parsed
}

function isAuthorized(request: Request) {
  const configuredToken = process.env[MONITOR_TOKEN_ENV_NAME]?.trim()
  if (!configuredToken) {
    return { ok: false as const, reason: "missing_config" }
  }

  const providedToken = getBearerToken(request)
  if (!providedToken || providedToken !== configuredToken) {
    return { ok: false as const, reason: "unauthorized" }
  }

  return { ok: true as const }
}

export async function GET(request: Request) {
  const auth = isAuthorized(request)
  if (!auth.ok) {
    if (auth.reason === "missing_config") {
      return errorResponse(
        503,
        "MONITOR_DISABLED",
        `${MONITOR_TOKEN_ENV_NAME} is not configured on this deployment`
      )
    }

    return errorResponse(401, "UNAUTHORIZED", "Missing or invalid monitor bearer token")
  }

  const url = new URL(request.url)
  const hostPresenceMs = parsePositiveInt(url.searchParams.get("hostPresenceMs"))
  const controllerPresenceMs = parsePositiveInt(url.searchParams.get("controllerPresenceMs"))
  const activity = await getRuntimeActivitySummary({
    hostPresenceMs,
    controllerPresenceMs,
  })

  return jsonResponse(200, activity)
}

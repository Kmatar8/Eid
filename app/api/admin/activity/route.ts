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

import { getCloudflareContext } from "@opennextjs/cloudflare"

async function getEnvVar(name: string): Promise<string | undefined> {
  // First try process.env (works locally and on traditional Node.js hosts)
  if (process.env[name]) {
    return process.env[name]
  }
  
  // As a fallback for Cloudflare open-next, check the request context env
  try {
    const context = await getCloudflareContext({ async: true })
    const env = context?.env as any
    if (env && env[name]) {
      return env[name]
    }
  } catch (e) {
    // getCloudflareContext might throw if we are not in a Cloudflare environment
  }
  
  return undefined
}

async function isAuthorized(request: Request) {
  const configuredToken = (await getEnvVar(MONITOR_TOKEN_ENV_NAME))?.trim()
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
  const auth = await isAuthorized(request)
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

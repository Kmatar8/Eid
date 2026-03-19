import { getRuntimeActivitySummary } from "@/lib/server/activity-monitor"
import { errorResponse, jsonResponse } from "@/lib/server/http"

export const runtime = "nodejs"

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
  const authHeader = request.headers.get("authorization")
  if (!authHeader || !authHeader.startsWith("Basic ")) {
    return { ok: false as const, reason: "unauthorized" }
  }

  try {
    const base64 = authHeader.split(" ")[1]
    const decoded = Buffer.from(base64, "base64").toString("utf-8")
    const [email, password] = decoded.split(":")

    if (email === "k.matar@me.com" && password === "Classic123$") {
      return { ok: true as const }
    }
  } catch (err) {
    return { ok: false as const, reason: "unauthorized" }
  }

  return { ok: false as const, reason: "unauthorized" }
}

export async function GET(request: Request) {
  const auth = isAuthorized(request)
  if (!auth.ok) {
    return errorResponse(401, "UNAUTHORIZED", "Missing or invalid admin credentials")
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

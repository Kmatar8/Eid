import { getRuntimeActivitySummary } from "@/lib/server/activity-monitor"
import { saveActivitySnapshot } from "@/lib/server/activity-history"
import { errorResponse, jsonResponse } from "@/lib/server/http"

export const runtime = "nodejs"

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
  } catch {
    return { ok: false as const, reason: "unauthorized" }
  }

  return { ok: false as const, reason: "unauthorized" }
}

export async function POST(request: Request) {
  const auth = isAuthorized(request)
  if (!auth.ok) {
    return errorResponse(401, "UNAUTHORIZED", "Missing or invalid admin credentials")
  }

  const activity = await getRuntimeActivitySummary()
  const success = await saveActivitySnapshot(activity)

  if (!success) {
    return errorResponse(500, "SNAPSHOT_FAILED", "Failed to save snapshot to D1")
  }

  return jsonResponse(201, { success: true })
}

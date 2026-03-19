import { getActivityHistory } from "@/lib/server/activity-history"
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

export async function GET(request: Request) {
  const auth = isAuthorized(request)
  if (!auth.ok) {
    return errorResponse(401, "UNAUTHORIZED", "Missing or invalid admin credentials")
  }

  const url = new URL(request.url)
  const range = url.searchParams.get("range") || "25h"

  let rangeMs = 0
  if (range === "25h") {
    rangeMs = 25 * 60 * 60 * 1000
  } else if (range === "7d") {
    rangeMs = 7 * 24 * 60 * 60 * 1000
  } else if (range === "30d") {
    rangeMs = 30 * 24 * 60 * 60 * 1000
  } else {
    rangeMs = 25 * 60 * 60 * 1000 // default
  }

  const history = await getActivityHistory(rangeMs)

  return jsonResponse(200, { history })
}

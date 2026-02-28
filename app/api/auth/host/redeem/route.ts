import { errorResponse } from "@/lib/server/http"

export const runtime = "nodejs"

export async function POST() {
  return errorResponse(
    410,
    "HOST_REDEEM_DEPRECATED",
    "Redeem flow is disabled. Use POST /api/auth/host/login with code as username and password."
  )
}

import { errorResponse } from "@/lib/server/http"

export const runtime = "nodejs"

export async function POST() {
  return errorResponse(
    410,
    "HOST_ACTIVATE_DEPRECATED",
    "Host activation is no longer required. Use /api/auth/host/login with code only."
  )
}

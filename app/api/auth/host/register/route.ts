import { errorResponse } from "@/lib/server/http"

export const runtime = "nodejs"

export async function POST() {
  return errorResponse(
    410,
    "HOST_REGISTER_DEPRECATED",
    "Register flow is disabled. Use POST /api/auth/host/login with code as username and password."
  )
}

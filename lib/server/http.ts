export function jsonResponse<T>(status: number, data: T) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store, no-cache, must-revalidate, max-age=0",
      pragma: "no-cache",
    },
  })
}

export function errorResponse(
  status: number,
  code: string,
  message: string,
  details?: Record<string, unknown>
) {
  return jsonResponse(status, {
    error: {
      code,
      message,
      ...(details ? { details } : {}),
    },
  })
}

export function getBearerToken(request: Request) {
  const raw = request.headers.get("authorization")
  if (!raw) {
    return null
  }

  const [scheme, token] = raw.split(" ")
  if (scheme?.toLowerCase() !== "bearer" || !token) {
    return null
  }

  return token
}

export async function safeJson<T>(request: Request): Promise<T | null> {
  try {
    return (await request.json()) as T
  } catch {
    return null
  }
}

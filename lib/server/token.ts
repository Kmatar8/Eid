import { createHmac, timingSafeEqual } from "crypto"

type TokenRole = "host" | "player"

export type TokenClaims = {
  sub: string
  role: TokenRole
  hostId?: string
  roomId?: string
  playerId?: string
  username?: string
  iat: number
  exp: number
}

export type HostTokenClaims = TokenClaims & {
  role: "host"
  hostId: string
}

export type PlayerTokenClaims = TokenClaims & {
  role: "player"
  playerId: string
  roomId: string
}

type SignableClaims = Omit<TokenClaims, "iat" | "exp">

const DEFAULT_TTL_SECONDS = 60 * 60 * 12

function getTokenSecret() {
  return process.env.HROOF_TOKEN_SECRET ?? "dev-only-insecure-token-secret"
}

function toBase64Url(value: string) {
  return Buffer.from(value, "utf8").toString("base64url")
}

function fromBase64Url(value: string) {
  return Buffer.from(value, "base64url").toString("utf8")
}

function sign(input: string) {
  return createHmac("sha256", getTokenSecret()).update(input).digest("base64url")
}

export function signToken(claims: SignableClaims, ttlSeconds = DEFAULT_TTL_SECONDS): string {
  const now = Math.floor(Date.now() / 1000)
  const payload: TokenClaims = {
    ...claims,
    iat: now,
    exp: now + ttlSeconds,
  }

  const header = toBase64Url(JSON.stringify({ alg: "HS256", typ: "JWT" }))
  const body = toBase64Url(JSON.stringify(payload))
  const signature = sign(`${header}.${body}`)

  return `${header}.${body}.${signature}`
}

export function verifyToken(token: string): TokenClaims | null {
  const [header, body, signature] = token.split(".")
  if (!header || !body || !signature) {
    return null
  }

  const expectedSignature = sign(`${header}.${body}`)
  const actualBuffer = Buffer.from(signature)
  const expectedBuffer = Buffer.from(expectedSignature)

  if (actualBuffer.length !== expectedBuffer.length) {
    return null
  }

  if (!timingSafeEqual(actualBuffer, expectedBuffer)) {
    return null
  }

  try {
    const parsed = JSON.parse(fromBase64Url(body)) as TokenClaims
    if (!parsed.sub || !parsed.role || !parsed.iat || !parsed.exp) {
      return null
    }

    const now = Math.floor(Date.now() / 1000)
    if (parsed.exp < now) {
      return null
    }

    return parsed
  } catch {
    return null
  }
}

export function isHostToken(claims: TokenClaims | null): claims is HostTokenClaims {
  return Boolean(claims && claims.role === "host" && typeof claims.hostId === "string")
}

export function isPlayerToken(claims: TokenClaims | null): claims is PlayerTokenClaims {
  return Boolean(
    claims &&
      claims.role === "player" &&
      typeof claims.playerId === "string" &&
      typeof claims.roomId === "string"
  )
}

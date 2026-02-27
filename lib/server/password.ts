import { pbkdf2Sync, randomBytes, timingSafeEqual } from "crypto"

const MAX_SUPPORTED_ITERATIONS = 100_000
const DEFAULT_ITERATIONS = 100_000
const KEY_LENGTH = 32
const DIGEST = "sha256"

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex")
  const derived = pbkdf2Sync(password, salt, DEFAULT_ITERATIONS, KEY_LENGTH, DIGEST).toString("hex")
  return `pbkdf2$${DEFAULT_ITERATIONS}$${salt}$${derived}`
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const [scheme, iterationsValue, salt, expectedHex] = storedHash.split("$")
  if (scheme !== "pbkdf2" || !iterationsValue || !salt || !expectedHex) {
    return false
  }

  const iterations = Number.parseInt(iterationsValue, 10)
  if (!Number.isFinite(iterations) || iterations <= 0 || iterations > MAX_SUPPORTED_ITERATIONS) {
    return false
  }

  try {
    const derived = pbkdf2Sync(password, salt, iterations, KEY_LENGTH, DIGEST)
    const expected = Buffer.from(expectedHex, "hex")

    if (derived.length !== expected.length) {
      return false
    }

    return timingSafeEqual(derived, expected)
  } catch {
    return false
  }
}

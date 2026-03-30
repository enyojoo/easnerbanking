/**
 * Client-side app PIN: PBKDF2-SHA256 hash in localStorage per Supabase user id.
 *
 * This PIN is device-local UX: idle soft-lock, unlock, and in-app confirmations (e.g. send).
 * It is NOT server-side MFA and NOT a second factor for Supabase. Payment and session
 * authorization must still be enforced on the server.
 *
 * Requires a secure context: HTTPS or http://localhost for Web Crypto (crypto.subtle).
 */

import {
  LOGIN_PIN_DERIVED_KEY_BITS,
  LOGIN_PIN_LOCKOUT_MS,
  LOGIN_PIN_MAX_FAILED_ATTEMPTS,
  LOGIN_PIN_PBKDF2_ITERATIONS,
  LOGIN_PIN_REGEX,
  LOGIN_PIN_SALT_BYTES,
} from "@easner/shared"

const STORAGE_PREFIX = "easner_business_login_pin_v1_"
const LOCKED_SUFFIX = "_locked"
const ATTEMPTS_SUFFIX = "_attempts"

export type LoginPinPayload = { saltB64: string; hashB64: string }

export type LoginPinAttempts = { count: number; lockUntil: number | null }

export type LoginPinLockoutState = {
  lockedOut: boolean
  lockedUntil: number | null
  failedAttempts: number
  msRemaining: number
}

function pinPayloadKey(userId: string) {
  return `${STORAGE_PREFIX}${userId}`
}

function lockedKey(userId: string) {
  return `${STORAGE_PREFIX}${userId}${LOCKED_SUFFIX}`
}

function attemptsKey(userId: string) {
  return `${STORAGE_PREFIX}${userId}${ATTEMPTS_SUFFIX}`
}

function bytesToB64(bytes: Uint8Array): string {
  let binary = ""
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!)
  return btoa(binary)
}

function b64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64)
  const out = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i)
  return out
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!
  return diff === 0
}

export function isLoginPinModuleAvailable(): boolean {
  return typeof window !== "undefined" && typeof crypto !== "undefined" && !!crypto.subtle
}

export function isValidPinFormat(pin: string): boolean {
  return LOGIN_PIN_REGEX.test(pin)
}

async function derivePinHash(pin: string, salt: Uint8Array): Promise<Uint8Array> {
  const enc = new TextEncoder()
  const keyMaterial = await crypto.subtle.importKey("raw", enc.encode(pin), "PBKDF2", false, ["deriveBits"])
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: salt.buffer.slice(salt.byteOffset, salt.byteOffset + salt.byteLength) as ArrayBuffer,
      iterations: LOGIN_PIN_PBKDF2_ITERATIONS,
      hash: "SHA-256",
    },
    keyMaterial,
    LOGIN_PIN_DERIVED_KEY_BITS,
  )
  return new Uint8Array(bits)
}

function readPayload(userId: string): LoginPinPayload | null {
  if (typeof window === "undefined") return null
  try {
    const raw = localStorage.getItem(pinPayloadKey(userId))
    if (!raw) return null
    const p = JSON.parse(raw) as LoginPinPayload
    if (typeof p?.saltB64 === "string" && typeof p?.hashB64 === "string") return p
    return null
  } catch {
    return null
  }
}

function readAttempts(userId: string): LoginPinAttempts {
  if (typeof window === "undefined") return { count: 0, lockUntil: null }
  try {
    const raw = localStorage.getItem(attemptsKey(userId))
    if (!raw) return { count: 0, lockUntil: null }
    const p = JSON.parse(raw) as LoginPinAttempts
    const count = typeof p.count === "number" ? p.count : 0
    const lockUntil = typeof p.lockUntil === "number" ? p.lockUntil : null
    return { count, lockUntil }
  } catch {
    return { count: 0, lockUntil: null }
  }
}

function writeAttempts(userId: string, a: LoginPinAttempts) {
  if (typeof window === "undefined") return
  localStorage.setItem(attemptsKey(userId), JSON.stringify(a))
}

export function getLockoutState(userId: string): LoginPinLockoutState {
  let { count, lockUntil } = readAttempts(userId)
  const now = Date.now()
  if (lockUntil != null && now >= lockUntil) {
    writeAttempts(userId, { count: 0, lockUntil: null })
    count = 0
    lockUntil = null
  }
  if (lockUntil != null && now < lockUntil) {
    return {
      lockedOut: true,
      lockedUntil: lockUntil,
      failedAttempts: count,
      msRemaining: lockUntil - now,
    }
  }
  return {
    lockedOut: false,
    lockedUntil: null,
    failedAttempts: count,
    msRemaining: 0,
  }
}

export function hasPin(userId: string): boolean {
  return readPayload(userId) != null
}

export async function setPin(userId: string, pin: string): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isLoginPinModuleAvailable()) {
    return { ok: false, error: "PIN storage requires Web Crypto (secure page: HTTPS or localhost)." }
  }
  if (!isValidPinFormat(pin)) {
    return { ok: false, error: "PIN must be exactly 4 digits." }
  }
  const salt = crypto.getRandomValues(new Uint8Array(LOGIN_PIN_SALT_BYTES))
  const hash = await derivePinHash(pin, salt)
  const payload: LoginPinPayload = {
    saltB64: bytesToB64(salt),
    hashB64: bytesToB64(hash),
  }
  localStorage.setItem(pinPayloadKey(userId), JSON.stringify(payload))
  writeAttempts(userId, { count: 0, lockUntil: null })
  return { ok: true }
}

export type VerifyPinResult =
  | { ok: true }
  | { ok: false; error: string; lockedOut?: boolean; lockedUntil?: number }

export async function verifyPin(userId: string, pin: string): Promise<VerifyPinResult> {
  if (!isLoginPinModuleAvailable()) {
    return { ok: false, error: "Web Crypto unavailable." }
  }
  if (!isValidPinFormat(pin)) {
    return { ok: false, error: "Enter a 4-digit PIN." }
  }

  const lock = getLockoutState(userId)
  if (lock.lockedOut && lock.lockedUntil != null) {
    return { ok: false, error: "PIN locked. Try again later.", lockedOut: true, lockedUntil: lock.lockedUntil }
  }

  const payload = readPayload(userId)
  if (!payload) {
    return { ok: false, error: "No PIN set for this account." }
  }

  const salt = b64ToBytes(payload.saltB64)
  const expected = b64ToBytes(payload.hashB64)
  const derived = await derivePinHash(pin, salt)

  if (timingSafeEqual(derived, expected)) {
    writeAttempts(userId, { count: 0, lockUntil: null })
    return { ok: true }
  }

  const prev = readAttempts(userId)
  const newCount = prev.count + 1
  let lockUntil: number | null = prev.lockUntil
  if (newCount >= LOGIN_PIN_MAX_FAILED_ATTEMPTS) {
    lockUntil = Date.now() + LOGIN_PIN_LOCKOUT_MS
  }
  writeAttempts(userId, { count: newCount, lockUntil })

  if (lockUntil != null && Date.now() < lockUntil) {
    return { ok: false, error: "Too many attempts. PIN is temporarily locked.", lockedOut: true, lockedUntil: lockUntil }
  }
  const remaining = LOGIN_PIN_MAX_FAILED_ATTEMPTS - newCount
  return {
    ok: false,
    error: remaining > 0 ? `Incorrect PIN. ${remaining} attempt(s) remaining.` : "Incorrect PIN.",
  }
}

export function setAppLocked(userId: string, locked: boolean) {
  if (typeof window === "undefined") return
  localStorage.setItem(lockedKey(userId), locked ? "1" : "0")
}

export function isAppLocked(userId: string): boolean {
  if (typeof window === "undefined") return false
  return localStorage.getItem(lockedKey(userId)) === "1"
}

export function removePin(userId: string) {
  if (typeof window === "undefined") return
  localStorage.removeItem(pinPayloadKey(userId))
  localStorage.removeItem(lockedKey(userId))
  localStorage.removeItem(attemptsKey(userId))
}

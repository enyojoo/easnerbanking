/**
 * Client-side app PIN: PBKDF2-SHA256 (same parameters as business Web Crypto in `business/lib/login-pin.ts`).
 * Parity with web is checked by `npm run test:login-pin-vectors` at the repo root.
 * Stored per user on device only. Used for idle soft-lock, unlock, and action confirmations.
 * NOT server MFA / not Supabase 2FA.
 *
 * iOS/Android: `react-native-quick-crypto` 0.x (OpenSSL via native JSI, no Nitro) — same KDF as web; falls back to @noble/hashes if unavailable
 * (100k iterations in JS was multi-second; business feels instant due to Web Crypto).
 * Expo web: `crypto.subtle` when available.
 */

import AsyncStorage from '@react-native-async-storage/async-storage'
import { Platform } from 'react-native'
import { getRandomBytes } from 'expo-crypto'
import { pbkdf2 } from '@noble/hashes/pbkdf2.js'
import { sha256 } from '@noble/hashes/sha2.js'
import {
  LOGIN_PIN_DERIVED_KEY_BITS,
  LOGIN_PIN_LOCKOUT_MS,
  LOGIN_PIN_MAX_FAILED_ATTEMPTS,
  LOGIN_PIN_PBKDF2_ITERATIONS,
  LOGIN_PIN_REGEX,
  LOGIN_PIN_SALT_BYTES,
} from '@easner/shared'

const STORAGE_PREFIX = 'easner_mobile_login_pin_v1_'
const LOCKED_SUFFIX = '_locked'
const ATTEMPTS_SUFFIX = '_attempts'
const SESSION_LAST_ACTIVE_KEY = '@easner_session_last_active'
const PIN_PROMPT_DISMISSED_KEY = '@easner_pin_prompt_dismissed'
const FIRST_LOGIN_KEY = '@easner_first_login_after_verification'

/** Same idle soft-lock window as business `APP_IDLE_TIMEOUT_MINUTES` in `business/lib/app-lock-config.ts`. */
const SESSION_TIMEOUT_MS = 5 * 60 * 1000

/**
 * In-process "last interaction" for idle evaluation. AsyncStorage is not updated on every touch
 * (too slow); this lets `evaluateIdleLock` treat active use as non-idle until the real timeout.
 */
let lastInteractionMonotonicMs = 0

/** Call on user touches / navigation while unlocked so idle lock does not fire mid-session. */
export function markSessionInteraction(): void {
  lastInteractionMonotonicMs = Date.now()
}

function resetSessionInteractionMemory(): void {
  lastInteractionMonotonicMs = 0
}

function effectiveLastActiveMs(storedRaw: string | null): number {
  const parsed = storedRaw ? parseInt(storedRaw, 10) : 0
  const stored = Number.isFinite(parsed) ? parsed : 0
  return Math.max(stored, lastInteractionMonotonicMs)
}

/** Per JS process: cold start should require PIN again for users who have a PIN (see `applyColdStartPinLockIfNeeded`). */
let coldStartPinLockUserId: string | null = null

function resetColdStartPinLockState() {
  coldStartPinLockUserId = null
}

/**
 * After the user creates a PIN in this JS session, the PIN gate effect re-runs and would otherwise
 * call `applyColdStartPinLockIfNeeded`, which locks whenever a PIN exists. Mark cold-start handled
 * here so enrollment does not immediately send them to PIN entry.
 */
export function skipColdStartPinLockForUser(userId: string): void {
  coldStartPinLockUserId = userId
}

/** Once per user per process: lock app if PIN exists (survives persisted unlocked flag from previous run). */
export async function applyColdStartPinLockIfNeeded(userId: string): Promise<void> {
  if (coldStartPinLockUserId === userId) return
  coldStartPinLockUserId = userId
  if (!(await hasPin(userId))) return
  await setAppLocked(userId, true)
}

export interface PinAuthResult {
  success: boolean
  error?: string
  locked?: boolean
  lockedUntil?: number
}

export type LoginPinPayload = { saltB64: string; hashB64: string }

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
  let binary = ''
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

async function derivePinHash(pin: string, salt: Uint8Array): Promise<Uint8Array> {
  const dkLen = LOGIN_PIN_DERIVED_KEY_BITS / 8
  const enc = new TextEncoder()
  const password = enc.encode(pin)

  // Browser / Expo Web — same path as `business/lib/login-pin.ts`
  if (typeof globalThis !== 'undefined' && globalThis.crypto?.subtle) {
    const keyMaterial = await globalThis.crypto.subtle.importKey('raw', password, 'PBKDF2', false, [
      'deriveBits',
    ])
    const saltBuf = salt.buffer.slice(
      salt.byteOffset,
      salt.byteOffset + salt.byteLength,
    ) as ArrayBuffer
    const bits = await globalThis.crypto.subtle.deriveBits(
      {
        name: 'PBKDF2',
        salt: saltBuf,
        iterations: LOGIN_PIN_PBKDF2_ITERATIONS,
        hash: 'SHA-256',
      },
      keyMaterial,
      LOGIN_PIN_DERIVED_KEY_BITS,
    )
    return new Uint8Array(bits)
  }

  // Native: OpenSSL-backed PBKDF2 (avoid multi-second pure-JS 100k iterations on Hermes)
  if (Platform.OS !== 'web') {
    try {
      type Pbkdf2SyncFn = (
        password: string | Uint8Array,
        salt: Uint8Array,
        iterations: number,
        keylen: number,
        digest: string,
      ) => Uint8Array
      const qc = require('react-native-quick-crypto') as {
        pbkdf2Sync?: Pbkdf2SyncFn
        default?: { pbkdf2Sync?: Pbkdf2SyncFn }
      }
      const pbkdf2Sync = qc?.pbkdf2Sync ?? qc?.default?.pbkdf2Sync
      if (typeof pbkdf2Sync === 'function') {
        const derived = pbkdf2Sync(pin, salt, LOGIN_PIN_PBKDF2_ITERATIONS, dkLen, 'sha256')
        return new Uint8Array(derived)
      }
    } catch (e) {
      console.warn('derivePinHash: react-native-quick-crypto failed, using @noble/hashes', e)
    }
  }

  return pbkdf2(sha256, password, salt, { c: LOGIN_PIN_PBKDF2_ITERATIONS, dkLen })
}

async function readPayload(userId: string): Promise<LoginPinPayload | null> {
  try {
    const raw = await AsyncStorage.getItem(pinPayloadKey(userId))
    if (!raw) return null
    const p = JSON.parse(raw) as LoginPinPayload
    if (typeof p?.saltB64 === 'string' && typeof p?.hashB64 === 'string') return p
    return null
  } catch {
    return null
  }
}

type Attempts = { count: number; lockUntil: number | null }

async function readAttempts(userId: string): Promise<Attempts> {
  try {
    const raw = await AsyncStorage.getItem(attemptsKey(userId))
    if (!raw) return { count: 0, lockUntil: null }
    const p = JSON.parse(raw) as Attempts
    return {
      count: typeof p.count === 'number' ? p.count : 0,
      lockUntil: typeof p.lockUntil === 'number' ? p.lockUntil : null,
    }
  } catch {
    return { count: 0, lockUntil: null }
  }
}

async function writeAttempts(userId: string, a: Attempts) {
  await AsyncStorage.setItem(attemptsKey(userId), JSON.stringify(a))
}

export async function getLockoutState(userId: string): Promise<LoginPinLockoutState> {
  let { count, lockUntil } = await readAttempts(userId)
  const now = Date.now()
  if (lockUntil != null && now >= lockUntil) {
    await writeAttempts(userId, { count: 0, lockUntil: null })
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

export async function hasPin(userId: string): Promise<boolean> {
  return (await readPayload(userId)) != null
}

export async function isPinSetup(userId?: string): Promise<boolean> {
  let uid = userId
  if (!uid) {
    const { supabase } = await import('./supabase')
    const { data } = await supabase.auth.getUser()
    uid = data.user?.id
  }
  if (!uid) return false
  return hasPin(uid)
}

export async function setAppLocked(userId: string, locked: boolean): Promise<void> {
  await AsyncStorage.setItem(lockedKey(userId), locked ? '1' : '0')
}

export async function isAppLocked(userId: string): Promise<boolean> {
  const v = await AsyncStorage.getItem(lockedKey(userId))
  return v === '1'
}

export async function setupPin(pin: string, userId?: string): Promise<PinAuthResult> {
  try {
    if (!LOGIN_PIN_REGEX.test(pin)) {
      return { success: false, error: 'PIN must be exactly 4 digits' }
    }
    let uid = userId
    if (!uid) {
      const { supabase } = await import('./supabase')
      const { data } = await supabase.auth.getUser()
      uid = data.user?.id
    }
    if (!uid) {
      return { success: false, error: 'User not authenticated' }
    }
    const salt = getRandomBytes(LOGIN_PIN_SALT_BYTES)
    const hash = await derivePinHash(pin, salt)
    const payload: LoginPinPayload = {
      saltB64: bytesToB64(salt),
      hashB64: bytesToB64(hash),
    }
    await AsyncStorage.setItem(pinPayloadKey(uid), JSON.stringify(payload))
    await writeAttempts(uid, { count: 0, lockUntil: null })
    return { success: true }
  } catch (e) {
    console.error('setupPin', e)
    return { success: false, error: 'Failed to set up PIN' }
  }
}

export async function verifyPin(pin: string, userId?: string): Promise<PinAuthResult> {
  try {
    let uid = userId
    if (!uid) {
      const { supabase } = await import('./supabase')
      const { data } = await supabase.auth.getUser()
      uid = data.user?.id
    }
    if (!uid) {
      return { success: false, error: 'User not authenticated' }
    }

    const lock = await getLockoutState(uid)
    if (lock.lockedOut && lock.lockedUntil != null) {
      const minutesLeft = Math.max(1, Math.ceil(lock.msRemaining / 60000))
      return {
        success: false,
        locked: true,
        lockedUntil: lock.lockedUntil,
        error: `PIN is locked. Try again in ${minutesLeft} minute(s)`,
      }
    }

    if (!LOGIN_PIN_REGEX.test(pin)) {
      return { success: false, error: 'Enter a 4-digit PIN' }
    }

    const payload = await readPayload(uid)
    if (!payload) {
      return { success: false, error: 'PIN not set up' }
    }

    const salt = b64ToBytes(payload.saltB64)
    const expected = b64ToBytes(payload.hashB64)
    const derived = await derivePinHash(pin, salt)

    if (timingSafeEqual(derived, expected)) {
      await writeAttempts(uid, { count: 0, lockUntil: null })
      await updateSessionActivity()
      return { success: true }
    }

    const prev = await readAttempts(uid)
    const newCount = prev.count + 1
    let lockUntil: number | null = prev.lockUntil
    if (newCount >= LOGIN_PIN_MAX_FAILED_ATTEMPTS) {
      lockUntil = Date.now() + LOGIN_PIN_LOCKOUT_MS
    }
    await writeAttempts(uid, { count: newCount, lockUntil })

    if (lockUntil != null && Date.now() < lockUntil) {
      return {
        success: false,
        locked: true,
        lockedUntil: lockUntil,
        error: 'Too many failed attempts. PIN is locked for 15 minutes.',
      }
    }
    const remaining = LOGIN_PIN_MAX_FAILED_ATTEMPTS - newCount
    return {
      success: false,
      error: remaining > 0 ? `Incorrect PIN. ${remaining} attempt(s) remaining.` : 'Incorrect PIN',
    }
  } catch (e) {
    console.error('verifyPin', e)
    return { success: false, error: 'Failed to verify PIN' }
  }
}

export async function removePin(userId: string): Promise<void> {
  await AsyncStorage.multiRemove([
    pinPayloadKey(userId),
    lockedKey(userId),
    attemptsKey(userId),
  ])
}

export async function clearPinAuth(): Promise<void> {
  try {
    resetColdStartPinLockState()
    const { supabase } = await import('./supabase')
    const { data } = await supabase.auth.getUser()
    const uid = data.user?.id
    if (uid) await removePin(uid)
    await AsyncStorage.removeItem(SESSION_LAST_ACTIVE_KEY)
    await AsyncStorage.removeItem(PIN_PROMPT_DISMISSED_KEY)
    resetSessionInteractionMemory()
  } catch (e) {
    console.error('clearPinAuth', e)
  }
}

export async function updateSessionActivity(): Promise<void> {
  const now = Date.now()
  lastInteractionMonotonicMs = now
  try {
    await AsyncStorage.setItem(SESSION_LAST_ACTIVE_KEY, now.toString())
  } catch {
    // ignore
  }
}

export async function clearSessionActivity(): Promise<void> {
  resetSessionInteractionMemory()
  try {
    await AsyncStorage.removeItem(SESSION_LAST_ACTIVE_KEY)
  } catch {
    // ignore
  }
}

export async function isSessionValid(): Promise<boolean> {
  try {
    const lastActive = await AsyncStorage.getItem(SESSION_LAST_ACTIVE_KEY)
    const effective = effectiveLastActiveMs(lastActive)
    if (effective === 0) return false
    return Date.now() - effective < SESSION_TIMEOUT_MS
  } catch {
    return false
  }
}

export async function shouldUsePin(userId?: string): Promise<boolean> {
  return await isPinSetup(userId)
}

export async function markFirstLoginAfterVerification(_userId: string): Promise<void> {
  /* reserved for analytics */
}

export async function isFirstLoginAfterVerification(userId: string): Promise<boolean> {
  try {
    const value = await AsyncStorage.getItem(`${FIRST_LOGIN_KEY}_${userId}`)
    return value !== 'true'
  } catch {
    return false
  }
}

export async function dismissPinPrompt(): Promise<void> {
  await AsyncStorage.setItem(PIN_PROMPT_DISMISSED_KEY, 'true')
}

export async function isPinPromptDismissed(): Promise<boolean> {
  const value = await AsyncStorage.getItem(PIN_PROMPT_DISMISSED_KEY)
  return value === 'true'
}

export async function getPinLockTimeRemaining(): Promise<number> {
  const { supabase } = await import('./supabase')
  const { data } = await supabase.auth.getUser()
  const uid = data.user?.id
  if (!uid) return 0
  const lock = await getLockoutState(uid)
  return lock.msRemaining
}

/** Idle exceeded: soft-lock if PIN exists, else caller should sign out. */
export async function evaluateIdleLock(userId: string): Promise<'locked' | 'signed_out' | 'ok'> {
  const last = await AsyncStorage.getItem(SESSION_LAST_ACTIVE_KEY)
  const effectiveLast = effectiveLastActiveMs(last)
  if (effectiveLast === 0) return 'ok'
  const idleMs = Date.now() - effectiveLast
  if (idleMs <= SESSION_TIMEOUT_MS) return 'ok'
  if (await hasPin(userId)) {
    await setAppLocked(userId, true)
    return 'locked'
  }
  return 'signed_out'
}

#!/usr/bin/env node
/**
 * Cross-platform PBKDF2 parity: Web Crypto (same as business login-pin) vs @noble/hashes (mobile).
 * Constants must stay aligned with packages/shared/src/constants/login-pin.ts
 */
import { webcrypto } from 'node:crypto'
import { pbkdf2 } from '@noble/hashes/pbkdf2.js'
import { sha256 } from '@noble/hashes/sha2.js'

const LOGIN_PIN_PBKDF2_ITERATIONS = 100_000
const LOGIN_PIN_DERIVED_KEY_BITS = 256
const LOGIN_PIN_SALT_BYTES = 16

/** Fixed test vector (not secret — deterministic salt for CI). */
const salt = new Uint8Array(LOGIN_PIN_SALT_BYTES)
for (let i = 0; i < salt.length; i++) salt[i] = i + 1

const pin = '1234'
const enc = new TextEncoder()

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false
  let d = 0
  for (let i = 0; i < a.length; i++) d |= a[i] ^ b[i]
  return d === 0
}

const subtle = webcrypto.subtle
const keyMaterial = await subtle.importKey('raw', enc.encode(pin), 'PBKDF2', false, ['deriveBits'])
const saltBuf = salt.buffer.slice(salt.byteOffset, salt.byteOffset + salt.byteLength)
const bits = await subtle.deriveBits(
  {
    name: 'PBKDF2',
    salt: saltBuf,
    iterations: LOGIN_PIN_PBKDF2_ITERATIONS,
    hash: 'SHA-256',
  },
  keyMaterial,
  LOGIN_PIN_DERIVED_KEY_BITS,
)
const webHash = new Uint8Array(bits)

const dkLen = LOGIN_PIN_DERIVED_KEY_BITS / 8
const nobleHash = pbkdf2(sha256, enc.encode(pin), salt, {
  c: LOGIN_PIN_PBKDF2_ITERATIONS,
  dkLen,
})

if (!timingSafeEqual(webHash, nobleHash)) {
  console.error('login-pin vector mismatch: Web Crypto !== @noble/hashes')
  console.error('web ', Buffer.from(webHash).toString('hex'))
  console.error('noble', Buffer.from(nobleHash).toString('hex'))
  process.exit(1)
}

console.log('login-pin PBKDF2 vectors OK (web crypto matches @noble/hashes)')

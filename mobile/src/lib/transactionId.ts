/**
 * Display format: uppercase `ETID` + **8 decimal digits** (aligned with business + ledger P2P).
 * Uses `expo-crypto` on native – `globalThis.crypto.getRandomValues` is often unset before polyfills load.
 */

import { getRandomBytes } from 'expo-crypto'

export const EASNER_ETID_FULL_REGEX = /^ETID(\d{8})$/i

export function isEasnerClientTransactionIdFormat(id: string): boolean {
  return EASNER_ETID_FULL_REGEX.test(String(id ?? '').trim())
}

function randomEightDecimalDigits(): string {
  try {
    const bytes = getRandomBytes(4)
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    const u = dv.getUint32(0, false)
    const n = u % 100_000_000
    return String(n).padStart(8, '0')
  } catch {
    const c = globalThis.crypto
    if (c?.getRandomValues) {
      const buf = new Uint32Array(1)
      c.getRandomValues(buf)
      return String(Number(buf[0]! % 100_000_000)).padStart(8, '0')
    }
    const n = Math.floor(Math.random() * 100_000_000)
    return String(n).padStart(8, '0')
  }
}

/** New sender-facing reference (e.g. amount → confirm → transfer `reserved_debit_etid`). */
export function generateTransactionId(): string {
  return `ETID${randomEightDecimalDigits()}`
}

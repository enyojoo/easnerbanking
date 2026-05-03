/**
 * Display format: uppercase `ETID` + **8 decimal digits** (aligned with business + `transfer_easetag_p2p`).
 * Uses `crypto.getRandomValues` — not timestamps — for unpredictable ids and lower collision risk.
 */

export const EASNER_ETID_FULL_REGEX = /^ETID(\d{8})$/i

export function isEasnerClientTransactionIdFormat(id: string): boolean {
  return EASNER_ETID_FULL_REGEX.test(String(id ?? '').trim())
}

function randomEightDecimalDigits(): string {
  const c = globalThis.crypto
  if (!c?.getRandomValues) {
    throw new Error('Web Crypto API (getRandomValues) is required to generate transaction ids')
  }
  const buf = new Uint32Array(1)
  c.getRandomValues(buf)
  const n = Number(buf[0]! % 100_000_000)
  return String(n).padStart(8, '0')
}

/** New sender-facing reference (e.g. amount → confirm → transfer `reserved_debit_etid`). */
export function generateTransactionId(): string {
  return `ETID${randomEightDecimalDigits()}`
}

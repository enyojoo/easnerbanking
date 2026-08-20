/**
 * Display format: uppercase `ETID` + **8 decimal digits** (aligned with `transfer_easetag_p2p` + URLs).
 * The 8 digits are from **Web Crypto** (`getRandomValues`), not wall-clock time – avoids predictable
 * ids and reduces collision risk vs timestamp suffixes. Global uniqueness still ultimately requires
 * the DB to reject duplicates (e.g. unique on `easner_transaction_id`) if you need a hard guarantee.
 */

/** Full id: `ETID` + exactly 8 decimal digits (case-insensitive `ETID` prefix). */
export const EASNER_ETID_FULL_REGEX = /^ETID(\d{8})$/i

export function isEasnerClientTransactionIdFormat(id: string): boolean {
  return EASNER_ETID_FULL_REGEX.test(String(id ?? "").trim())
}

function randomEightDecimalDigits(): string {
  const c = globalThis.crypto
  if (!c?.getRandomValues) {
    throw new Error("Web Crypto API (getRandomValues) is required to generate transaction ids")
  }
  const buf = new Uint32Array(1)
  c.getRandomValues(buf)
  const n = Number(buf[0]! % 100_000_000)
  return String(n).padStart(8, "0")
}

/**
 * New sender-facing reference for flows that need an id before the server responds.
 * Example: `ETID38472916`
 */
export function generateTransactionId(): string {
  return `ETID${randomEightDecimalDigits()}`
}

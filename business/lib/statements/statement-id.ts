/** Crockford base32 (no I, L, O, U). */
const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"

export function generateStatementId(at = new Date()): string {
  const ymd = at.toISOString().slice(0, 10).replace(/-/g, "")
  const c = globalThis.crypto
  if (!c?.getRandomValues) {
    throw new Error("Web Crypto API is required to generate statement ids")
  }
  const buf = new Uint8Array(4)
  c.getRandomValues(buf)
  let suffix = ""
  for (const b of buf) suffix += CROCKFORD[b! % CROCKFORD.length]
  return `EST-${ymd}-${suffix}`
}

export function isStatementIdFormat(raw: string): boolean {
  return /^EST-\d{8}-[0-9A-HJKMNP-TV-Z]{4}$/.test(String(raw ?? "").trim())
}

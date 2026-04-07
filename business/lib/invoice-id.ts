/**
 * Client-side invoice row id before POST (DB assigns its own uuid on insert).
 * Uses a random UUID so invoice numbers derived from it are unique per business.
 */
export function generateInvoiceId(): string {
  if (typeof globalThis !== "undefined" && typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID()
  }
  return `inv-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`
}

/** Stable display number from client id (uuid or legacy `EINV…` id). */
export function formatInvoiceNumberFromClientId(clientId: string): string {
  const s = String(clientId ?? "").trim()
  if (!s) return `EINV-${Date.now().toString(36)}`
  const hex = s.replace(/-/g, "")
  if (hex.length >= 12) return `EINV-${hex.slice(0, 12).toUpperCase()}`
  return `EINV-${hex.slice(0, 16).toUpperCase()}`
}

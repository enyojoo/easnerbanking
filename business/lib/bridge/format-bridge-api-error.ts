import { BridgeHttpError } from "./http"

function readString(value: unknown): string | null {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  return trimmed || null
}

export function keysFromBridgeErrorSource(source: unknown): string[] {
  if (!source || typeof source !== "object") return []
  const rec = source as Record<string, unknown>
  const key = rec.key
  if (typeof key === "string" && key.trim()) {
    return key.split(",").map((part) => part.trim()).filter(Boolean)
  }
  if (Array.isArray(key)) {
    return key.map((part) => String(part ?? "").trim()).filter(Boolean)
  }
  if (key && typeof key === "object") {
    return Object.keys(key)
  }
  if (typeof rec.name === "string" && rec.name.trim()) return [rec.name.trim()]
  return []
}

export function bridgeErrorSourceKeys(error: unknown): string[] {
  if (!(error instanceof BridgeHttpError) || !error.body || typeof error.body !== "object") {
    return []
  }
  return keysFromBridgeErrorSource((error.body as { source?: unknown }).source)
}

function messagesFromBody(body: unknown): string[] {
  if (!body) return []
  if (typeof body === "string") {
    const trimmed = body.trim()
    return trimmed ? [trimmed] : []
  }
  if (typeof body !== "object") return []
  const record = body as Record<string, unknown>
  const direct =
    readString(record.message) ?? readString(record.error) ?? readString(record.detail)
  const out: string[] = direct ? [direct] : []
  const errors = record.errors
  if (Array.isArray(errors)) {
    for (const row of errors) {
      if (typeof row === "string" && row.trim()) out.push(row.trim())
      if (!row || typeof row !== "object") continue
      const e = row as Record<string, unknown>
      const msg = readString(e.message) ?? readString(e.reason)
      if (msg) out.push(msg)
    }
  }
  const keys = keysFromBridgeErrorSource(record.source)
  if (keys.length) out.push(keys.join(", "))
  return out
}

export function isBridgeExistingCustomerError(error: unknown): boolean {
  const msg = formatBridgeApiError(error)
  return /already|exists|duplicate/i.test(msg)
}

export function customerIdFromBridgeError(error: unknown): string | null {
  if (!(error instanceof BridgeHttpError) || !error.body || typeof error.body !== "object") {
    return null
  }
  const rec = error.body as Record<string, unknown>
  for (const key of ["customer_id", "customerId", "existing_customer_id"]) {
    const value = String(rec[key] ?? "").trim()
    if (value) return value
  }
  const errors = rec.errors
  if (Array.isArray(errors)) {
    for (const row of errors) {
      if (!row || typeof row !== "object") continue
      const e = row as Record<string, unknown>
      for (const key of ["customer_id", "customerId"]) {
        const value = String(e[key] ?? "").trim()
        if (value) return value
      }
    }
  }
  return null
}

export function formatBridgeApiError(error: unknown): string {
  if (error instanceof BridgeHttpError) {
    const fromBody = messagesFromBody(error.body)
    if (fromBody[0]) return fromBody[0]
    return error.message
  }
  if (error instanceof Error) return error.message
  return String(error)
}

function isTimeoutError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false
  const name = "name" in error ? String((error as { name?: unknown }).name ?? "") : ""
  if (name === "TimeoutError" || name === "AbortError") return true
  const msg = error instanceof Error ? error.message : String(error)
  return /aborted|timeout/i.test(msg)
}

/** Customer-facing copy for hosted KYC/KYB start. Never names the vendor. */
export function formatBridgeKycStartError(error: unknown): string {
  const msg = formatBridgeApiError(error)
  const keys = bridgeErrorSourceKeys(error).join(" ")
  const haystack = `${msg} ${keys}`
  if (isTimeoutError(error)) {
    return "Verification is taking longer than expected. Wait a moment and try again."
  }
  if (/already|exists|duplicate|idempotenc/i.test(haystack)) {
    return "Verification is already in progress. Close this and try again in a moment."
  }
  if (/redirect_uri|redirect uri/i.test(haystack)) {
    return "We couldn't open verification. Please try again, or contact support if this keeps happening."
  }
  if (/transliterat|full_name/i.test(haystack)) {
    return "Use the Latin-letter version of your name to start verification."
  }
  if (/not configured/i.test(haystack)) {
    return "Verification is not available right now. Please try again later."
  }
  return "We couldn't start verification right now. Please try again in a moment, or contact support if this keeps happening."
}

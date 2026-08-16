import { GridHttpError } from "./http"

function readString(value: unknown): string | null {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  return trimmed || null
}

/** Human-readable Grid API failure for API routes and logs. */
export function formatGridApiError(error: unknown): string {
  if (error instanceof GridHttpError) {
    const body = error.body
    if (body && typeof body === "object") {
      const record = body as Record<string, unknown>
      const direct =
        readString(record.message) ??
        readString(record.reason) ??
        readString(record.error) ??
        readString(record.detail)
      if (direct) return direct

      const errors = record.errors
      if (Array.isArray(errors) && errors.length) {
        const parts = errors
          .map((row) => {
            if (!row || typeof row !== "object") return null
            const e = row as Record<string, unknown>
            const reason = readString(e.reason) ?? readString(e.message)
            const field = readString(e.field)
            if (reason && field) return `${field}: ${reason}`
            return reason
          })
          .filter(Boolean)
        if (parts.length) return parts.join("; ")
      }
    }
    return `${error.message} (Grid HTTP ${error.status}${error.path ? ` ${error.path}` : ""})`
  }
  if (error instanceof Error) return error.message
  return String(error)
}

/** User-facing copy for hosted KYB start failures. */
export function formatHostedKybStartError(error: unknown): string {
  const msg = formatGridApiError(error)
  if (msg === "grid_end_user_terms_required" || msg.includes("grid_end_user_terms")) {
    return "Please accept the latest terms, then try verification again."
  }
  if (msg.includes("country of registration") || msg.includes("A contact email is required")) {
    return msg
  }
  if (msg.includes("could not be finalized")) {
    return "Could not prepare your verification session. Please try again."
  }
  if (/customer not found/i.test(msg)) {
    return "Your previous verification session expired. Start verification again."
  }
  return msg || "Could not start verification."
}

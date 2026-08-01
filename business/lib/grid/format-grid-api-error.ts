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

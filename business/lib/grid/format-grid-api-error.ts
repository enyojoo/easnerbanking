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

function isTimeoutError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false
  const name = "name" in error ? String((error as { name?: unknown }).name ?? "") : ""
  if (name === "TimeoutError" || name === "AbortError") return true
  const msg = error instanceof Error ? error.message : String(error)
  return /aborted|timeout/i.test(msg)
}

function isDocumentScreeningError(error: unknown, msg: string): boolean {
  if (error instanceof GridHttpError && error.status === 422) return true
  return /DOCUMENT_REJECTED|UNREADABLE|POOR_QUALITY|INCOMPLETE_DOCUMENT|unreadable|poor quality|document.?reject|could not read an uploaded document/i.test(
    msg,
  )
}

/** User-facing Grid payout quote failures (Thunes corridors, etc.). */
export function mapGridPayoutQuoteUserError(error: unknown): string {
  const msg = formatGridApiError(error)
  if (/No Thunes payer.*CNY.*BankAccount.*B2C|Thunes payer.*currency=CNY.*B2C/i.test(msg)) {
    return "China bank transfers require a business recipient. For individuals, send via AliPay or WeChat Pay."
  }
  if (/No Thunes payer/i.test(msg)) {
    return "This payout corridor is unavailable for the selected recipient. Try another bank or payment method."
  }
  return msg || "Could not lock payout order. Try again."
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
  if (isTimeoutError(error)) {
    return "Verification is taking longer than expected. Wait a moment and try again."
  }
  if (isDocumentScreeningError(error, msg)) {
    return "This ID photo could not be read. Photograph the physical document in color, all four corners in frame, with no glare or screenshot."
  }
  if (/could not be started|could not start verification/i.test(msg)) {
    return "We couldn’t start verification. Check each owner’s date of birth, address, tax ID, and ID photos, then try again."
  }
  return msg || "Could not start verification."
}

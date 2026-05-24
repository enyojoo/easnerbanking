import { NoahHttpError } from "@/lib/noah/http"

/** Map Noah prepare/sell API errors to user-facing copy. */
export function mapNoahPrepareError(e: unknown): string {
  if (e instanceof NoahHttpError) {
    const msg = e.message.toLowerCase()
    if (msg.includes("reference")) {
      return "Payment reference is required or invalid for this corridor."
    }
    if (msg.includes("bank") && (msg.includes("enum") || msg.includes("invalid"))) {
      return "Selected bank is not valid for this corridor. Re-save the recipient and pick a bank from the list."
    }
    if (msg.includes("formsession") || (msg.includes("session") && msg.includes("expired"))) {
      return "This quote expired. Go back and get a fresh quote."
    }
    if (msg.includes("phone")) {
      return "A valid phone number is required for this payout."
    }
    if (msg.includes("paymentpurpose") || msg.includes("payment purpose")) {
      return "Payment purpose is required or not allowed for this corridor."
    }
    if (e.status === 401 || e.status === 403) {
      return "Payout authorization failed. Check your Noah verification status."
    }
    return e.message.slice(0, 280)
  }
  if (e instanceof Error) return e.message
  return String(e)
}

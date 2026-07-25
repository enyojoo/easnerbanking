import { GridHttpError } from "./http"

export function mapGridFundBalanceConfirmError(e: unknown): string {
  if (e instanceof GridHttpError) {
    const body = (e.body ?? {}) as { code?: string; reason?: string }
    if (body.code === "CUSTOMER_NOT_FOUND") {
      return "Pay-in profile was reset. Tap Continue again to refresh it."
    }
    if (body.code === "ACCOUNT_NOT_FOUND") {
      return "Your USD balance account is still setting up. Try again in a moment."
    }
    if (body.reason?.trim()) return body.reason.trim()
    if (e.status === 404) {
      return "Pay-in is unavailable right now. Try again shortly."
    }
  }
  if (e instanceof Error) {
    if (e.message === "Grid USD internal account is not ready for this customer yet.") {
      return "Your USD balance account is still setting up on Grid. Try again in a moment."
    }
    return e.message
  }
  return "grid_fund_balance_confirm_failed"
}

export function logGridFundBalanceConfirmError(e: unknown, extra?: Record<string, unknown>): void {
  if (e instanceof GridHttpError) {
    console.error("[grid-fund-balance]", {
      stage: "confirm",
      httpStatus: e.status,
      gridMethod: e.method,
      gridPath: e.path,
      gridBody: e.body,
      ...extra,
    })
    return
  }
  console.error("[grid-fund-balance]", { stage: "confirm", error: e, ...extra })
}

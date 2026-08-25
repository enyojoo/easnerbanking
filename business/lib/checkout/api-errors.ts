import { NextResponse } from "next/server"

export type CheckoutApiErrorType =
  | "invalid_request_error"
  | "authentication_error"
  | "permission_error"
  | "rate_limit_error"
  | "idempotency_error"
  | "api_error"

/**
 * Error shape for the merchant checkout API. `error` stays a plain string for
 * existing integrations; `code` and `type` are the machine-readable contract.
 */
export function checkoutApiError(
  status: number,
  code: string,
  message: string,
  type?: CheckoutApiErrorType,
): NextResponse {
  const resolvedType: CheckoutApiErrorType =
    type ??
    (status === 401
      ? "authentication_error"
      : status === 403
        ? "permission_error"
        : status === 429
          ? "rate_limit_error"
          : status >= 500
            ? "api_error"
            : "invalid_request_error")
  return NextResponse.json(
    { error: message, code, type: resolvedType },
    { status },
  )
}

export type CheckoutApiErrorType = "invalid_request" | "authentication" | "permission" | "api_error"

export type CheckoutApiErrorBody = {
  error: {
    type: CheckoutApiErrorType
    code: string
    message: string
  }
}

export function checkoutApiError(
  status: number,
  code: string,
  message: string,
  type?: CheckoutApiErrorType,
): { status: number; body: CheckoutApiErrorBody } {
  const resolvedType: CheckoutApiErrorType =
    type ??
    (status === 401
      ? "authentication"
      : status === 403
        ? "permission"
        : status >= 500
          ? "api_error"
          : "invalid_request")
  return {
    status,
    body: {
      error: { type: resolvedType, code, message },
    },
  }
}

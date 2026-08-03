export type YcPayoutErrorCode =
  | "YC_SEND_FEE_UNAVAILABLE"
  | "YC_SEND_PRECISION_UNDETERMINED"
  | "YC_SEND_NO_COMPLIANT_QUANTUM"
  | "YC_QUOTE_EXPIRED"
  | "YC_SEND_UNAVAILABLE"

export class YcPayoutError extends Error {
  readonly code: YcPayoutErrorCode
  readonly status: 409 | 422 | 503

  constructor(code: YcPayoutErrorCode, message: string, status: 409 | 422 | 503) {
    super(message)
    this.name = "YcPayoutError"
    this.code = code
    this.status = status
  }
}

export function asYcPayoutError(value: unknown): YcPayoutError | null {
  return value instanceof YcPayoutError ? value : null
}

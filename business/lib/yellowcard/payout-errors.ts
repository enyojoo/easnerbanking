export type YcPayoutErrorCode =
  | "YC_SEND_FEE_UNAVAILABLE"
  | "YC_SEND_PRECISION_UNDETERMINED"
  | "YC_SEND_NO_COMPLIANT_QUANTUM"
  | "YC_QUOTE_EXPIRED"
  | "YC_SEND_UNAVAILABLE"

export const YC_PAYOUT_USER_MESSAGE = {
  YC_SEND_FEE_UNAVAILABLE: "This transfer is temporarily unavailable. Try again shortly.",
  YC_SEND_PRECISION_UNDETERMINED: "We couldn't complete this transfer at the amount shown. Try a slightly different amount.",
  YC_SEND_NO_COMPLIANT_QUANTUM:
    "We couldn't complete this transfer at the amount shown. Try a slightly different amount.",
  YC_QUOTE_EXPIRED: "This quote expired. Go back and try again.",
  YC_SEND_UNAVAILABLE: "This transfer is temporarily unavailable. Try again shortly.",
} as const satisfies Record<YcPayoutErrorCode, string>

export function ycPayoutUserMessage(code: string | null | undefined): string {
  const key = String(code ?? "").trim() as YcPayoutErrorCode
  return YC_PAYOUT_USER_MESSAGE[key] ?? YC_PAYOUT_USER_MESSAGE.YC_SEND_UNAVAILABLE
}

export class YcPayoutError extends Error {
  readonly code: YcPayoutErrorCode
  readonly status: 409 | 422 | 503

  constructor(code: YcPayoutErrorCode, message: string, status: 409 | 422 | 503) {
    super(message)
    this.name = "YcPayoutError"
    this.code = code
    this.status = status
  }

  get userMessage(): string {
    return ycPayoutUserMessage(this.code)
  }
}

export function asYcPayoutError(value: unknown): YcPayoutError | null {
  return value instanceof YcPayoutError ? value : null
}

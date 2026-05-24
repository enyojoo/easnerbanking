import { NoahHttpError } from "@/lib/noah/http"

/** Structured Vercel log line for Noah prepare/sell failures (search: `noah_payout`). */
export function logNoahPayoutFailure(
  stage: string,
  e: unknown,
  meta?: Record<string, unknown>,
): void {
  const payload: Record<string, unknown> = { stage, ...meta }

  if (e instanceof NoahHttpError) {
    let noahBodyJson: string | null = null
    try {
      noahBodyJson = e.body == null ? null : JSON.stringify(e.body)
    } catch {
      noahBodyJson = null
    }
    console.error("[noah_payout]", {
      ...payload,
      httpStatus: e.status,
      noahDetail: e.detail ?? e.message,
      noahType: e.type ?? null,
      noahBody: e.body ?? null,
      // Stringified copy so deeply nested arrays (e.g. RequestExtension.Body validator output) survive Vercel log truncation.
      noahBodyJson,
    })
    return
  }

  console.error("[noah_payout]", {
    ...payload,
    error: e instanceof Error ? e.message : String(e),
    stack: e instanceof Error ? e.stack : undefined,
  })
}

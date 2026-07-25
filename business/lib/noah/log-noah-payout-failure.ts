import { GridHttpError } from "@/lib/grid/http"
import { NoahHttpError } from "@/lib/noah/http"

/** Structured Vercel log line for payout failures (search: `payout` or legacy `noah_payout`). */
export function logNoahPayoutFailure(
  stage: string,
  e: unknown,
  meta?: Record<string, unknown>,
): void {
  const payload: Record<string, unknown> = { stage, ...meta }

  if (e instanceof GridHttpError) {
    let gridBodyJson: string | null = null
    try {
      gridBodyJson = e.body == null ? null : JSON.stringify(e.body)
    } catch {
      gridBodyJson = null
    }
    console.error("[payout]", {
      ...payload,
      provider: "grid",
      httpStatus: e.status,
      gridDetail: e.message,
      gridMethod: e.method ?? null,
      gridPath: e.path ?? null,
      gridBody: e.body ?? null,
      gridBodyJson,
    })
    return
  }

  if (e instanceof NoahHttpError) {
    let noahBodyJson: string | null = null
    try {
      noahBodyJson = e.body == null ? null : JSON.stringify(e.body)
    } catch {
      noahBodyJson = null
    }
    console.error("[payout]", {
      ...payload,
      provider: "noah",
      httpStatus: e.status,
      noahDetail: e.detail ?? e.message,
      noahType: e.type ?? null,
      noahBody: e.body ?? null,
      // Stringified copy so deeply nested arrays (e.g. RequestExtension.Body validator output) survive Vercel log truncation.
      noahBodyJson,
    })
    return
  }

  console.error("[payout]", {
    ...payload,
    provider: meta?.provider ?? null,
    error: e instanceof Error ? e.message : String(e),
    stack: e instanceof Error ? e.stack : undefined,
  })
}

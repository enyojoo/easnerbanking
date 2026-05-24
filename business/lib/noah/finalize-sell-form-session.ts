import { noahFetch } from "@/lib/noah/http"
import { logNoahPayoutFailure } from "@/lib/noah/log-noah-payout-failure"
export type SellPrepareResult = {
  formSessionId?: string
  cryptoAuthorizedAmount?: string
  cryptoAmountEstimate?: string
  paymentMethodId?: string
  totalFee?: string
  raw: Record<string, unknown>
}

export type NoahFormNextStep = {
  stepId: string
  stepType: string
}

function deepFindPaymentMethodId(obj: unknown): string | null {
  if (!obj || typeof obj !== "object") return null
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    if (
      typeof v === "string" &&
      v.length > 8 &&
      /paymentmethodid|fiatpaymentmethodid|externalaccountid/i.test(k)
    ) {
      return v
    }
    const inner = deepFindPaymentMethodId(v)
    if (inner) return inner
  }
  return null
}

export function parsePrepareSellRaw(raw: Record<string, unknown>): SellPrepareResult {
  const pm = deepFindPaymentMethodId(raw)
  return {
    formSessionId: String(raw.FormSessionID ?? raw.formSessionId ?? ""),
    cryptoAuthorizedAmount: String(raw.CryptoAuthorizedAmount ?? raw.cryptoAuthorizedAmount ?? ""),
    cryptoAmountEstimate: String(raw.CryptoAmountEstimate ?? raw.cryptoAmountEstimate ?? ""),
    paymentMethodId: pm ?? undefined,
    totalFee: String(raw.TotalFee ?? raw.totalFee ?? ""),
    raw,
  }
}

export function parseNoahFormNextStep(raw: Record<string, unknown>): NoahFormNextStep | null {
  const ns = raw.NextStep ?? raw.nextStep
  if (!ns || typeof ns !== "object") return null
  const o = ns as Record<string, unknown>
  const stepId = String(o.StepID ?? o.stepId ?? "").trim()
  const stepType = String(o.StepType ?? o.stepType ?? "").trim()
  if (!stepId && !stepType) return null
  return { stepId, stepType }
}

export function sellFormSessionNeedsFinalize(raw: Record<string, unknown>): boolean {
  const next = parseNoahFormNextStep(raw)
  if (next) return true
  if (raw.FormSessionComplete === false || raw.formSessionComplete === false) return true
  const status = String(raw.FormSessionStatus ?? raw.formSessionStatus ?? "").toLowerCase()
  if (status && !/(complete|completed|done)/.test(status)) return true
  return false
}

async function postSellPrepare(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  try {
    return await noahFetch<Record<string, unknown>>({
      method: "POST",
      path: "/transactions/sell/prepare",
      json: body,
    })
  } catch {
    return await noahFetch<Record<string, unknown>>({
      method: "POST",
      path: "/transactions/sell/prepare",
      json: {
        channelId: body.ChannelID ?? body.channelId,
        cryptoCurrency: body.CryptoCurrency ?? body.cryptoCurrency,
        fiatAmount: body.FiatAmount ?? body.fiatAmount,
        form: body.Form ?? body.form ?? {},
        delayedSell: body.DelayedSell ?? body.delayedSell ?? true,
        ...(body.CustomerID || body.customerId
          ? { customerId: body.CustomerID ?? body.customerId }
          : {}),
        ...(body.FormSessionID || body.formSessionId
          ? { formSessionId: body.FormSessionID ?? body.formSessionId }
          : {}),
        ...(body.PaymentMethodID || body.paymentMethodId
          ? { paymentMethodId: body.PaymentMethodID ?? body.paymentMethodId }
          : {}),
      },
    })
  }
}

/**
 * Noah Reliance sell often leaves a pending form step (e.g. Cob = beneficiary confirmation)
 * after the first prepare when DelayedSell is true. A follow-up prepare completes the session
 * before POST /transactions/sell.
 */
export async function finalizeSellFormSessionAfterPrepare(input: {
  channelId: string
  cryptoCurrency: string
  fiatAmount: string
  customerId?: string
  initialForm: Record<string, unknown>
  prep: SellPrepareResult
}): Promise<SellPrepareResult> {
  const formSessionId = String(input.prep.formSessionId || "").trim()
  if (!formSessionId) return input.prep

  let raw = input.prep.raw
  let result = input.prep
  const formVariants: Record<string, unknown>[] = [{}, input.initialForm]

  for (let attempt = 0; attempt < 4; attempt++) {
    const needs =
      attempt === 0 ||
      sellFormSessionNeedsFinalize(raw) ||
      parseNoahFormNextStep(raw)?.stepId.toLowerCase() === "cob"
    if (!needs) break

    const next = parseNoahFormNextStep(raw)
    const useEmptyForm =
      !next || next.stepType.toLowerCase() === "ack" || next.stepId.toLowerCase() === "cob"
    const form = useEmptyForm ? formVariants[0]! : formVariants[1]!

    try {
      raw = await postSellPrepare({
        ChannelID: input.channelId,
        CryptoCurrency: input.cryptoCurrency,
        FiatAmount: input.fiatAmount,
        FormSessionID: formSessionId,
        Form: form,
        DelayedSell: false,
        ...(input.customerId ? { CustomerID: input.customerId } : {}),
        ...(result.paymentMethodId ? { PaymentMethodID: result.paymentMethodId } : {}),
      })
      result = parsePrepareSellRaw(raw)
      if (!sellFormSessionNeedsFinalize(raw)) break
    } catch (e) {
      logNoahPayoutFailure("prepare_finalize", e, {
        channelId: input.channelId,
        formSessionIdPrefix: formSessionId.slice(0, 12),
        paymentMethodId: result.paymentMethodId ?? null,
        attempt,
        nextStep: next ?? null,
      })
      if (attempt === 0 && useEmptyForm) continue
      break
    }
  }

  return result
}

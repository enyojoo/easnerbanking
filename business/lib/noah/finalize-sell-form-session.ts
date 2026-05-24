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
  schema?: Record<string, unknown>
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
  const schemaRaw = o.Schema ?? o.schema
  const schema =
    schemaRaw && typeof schemaRaw === "object" ? (schemaRaw as Record<string, unknown>) : undefined
  if (!stepId && !stepType) return null
  return { stepId, stepType, schema }
}

export function sellFormSessionNeedsFinalize(raw: Record<string, unknown>): boolean {
  const next = parseNoahFormNextStep(raw)
  if (next) return true
  if (raw.FormSessionComplete === false || raw.formSessionComplete === false) return true
  const status = String(raw.FormSessionStatus ?? raw.formSessionStatus ?? "").toLowerCase()
  if (status && !/(complete|completed|done)/.test(status)) return true
  return false
}

/** Build Form payload for Noah Ack steps (e.g. Cob = beneficiary confirmation). */
export function buildAckFormForNextStep(next: NoahFormNextStep): Record<string, unknown> {
  const schema = next.schema
  if (schema && typeof schema === "object") {
    const props = schema.properties as Record<string, unknown> | undefined
    if (props && typeof props === "object") {
      const form: Record<string, unknown> = {}
      for (const [key, def] of Object.entries(props)) {
        const d = def as Record<string, unknown>
        if (d.type === "boolean") form[key] = true
        else if (d.const !== undefined) form[key] = d.const
      }
      if (Object.keys(form).length > 0) return form
    }
  }
  const id = next.stepId.trim()
  if (!id) return {}
  return { [id]: { Confirmed: true, Acknowledged: true } }
}

function uniqueFormCandidates(
  next: NoahFormNextStep | null,
  initialForm: Record<string, unknown>,
): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = []
  const seen = new Set<string>()
  const push = (form: Record<string, unknown>) => {
    const key = JSON.stringify(form)
    if (seen.has(key)) return
    seen.add(key)
    out.push(form)
  }

  if (next) {
    push(buildAckFormForNextStep(next))
    if (next.stepId) {
      push({ [next.stepId]: true })
      push({ [next.stepId]: { Confirmed: true } })
    }
    if (next.stepType.toLowerCase() === "dataentry" && Object.keys(initialForm).length > 0) {
      push(initialForm)
    }
  }
  push({})
  if (Object.keys(initialForm).length > 0) push(initialForm)
  return out
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

export function assertSellFormSessionReady(prep: SellPrepareResult): void {
  if (!String(prep.formSessionId || "").trim()) {
    throw new Error("Noah prepare did not return a form session.")
  }
  if (!sellFormSessionNeedsFinalize(prep.raw)) return
  const next = parseNoahFormNextStep(prep.raw)
  const step = next?.stepId ? ` (pending ${next.stepId})` : ""
  throw new Error(
    `Payout setup did not finish${step}. Check the recipient bank details and try again.`,
  )
}

/**
 * Noah Reliance sell often leaves a pending form step (e.g. Cob = beneficiary confirmation)
 * after the first prepare when DelayedSell is true. Follow-up prepare calls with FormSessionID
 * submit the Ack/DataEntry payload before POST /transactions/sell.
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
  if (!sellFormSessionNeedsFinalize(raw)) return result

  const tried = new Set<string>()

  for (let round = 0; round < 8 && sellFormSessionNeedsFinalize(raw); round++) {
    const next = parseNoahFormNextStep(raw)
    const forms = uniqueFormCandidates(next, input.initialForm)

    for (const delayedSell of [true, false] as const) {
      for (const form of forms) {
        const attemptKey = JSON.stringify({ form, delayedSell, round })
        if (tried.has(attemptKey)) continue
        tried.add(attemptKey)

        try {
          raw = await postSellPrepare({
            ChannelID: input.channelId,
            CryptoCurrency: input.cryptoCurrency,
            FiatAmount: input.fiatAmount,
            FormSessionID: formSessionId,
            Form: form,
            DelayedSell: delayedSell,
            ...(input.customerId ? { CustomerID: input.customerId } : {}),
            ...(result.paymentMethodId ? { PaymentMethodID: result.paymentMethodId } : {}),
          })
          result = parsePrepareSellRaw(raw)
          if (!sellFormSessionNeedsFinalize(raw)) return result
        } catch (e) {
          logNoahPayoutFailure("prepare_finalize", e, {
            channelId: input.channelId,
            formSessionIdPrefix: formSessionId.slice(0, 12),
            paymentMethodId: result.paymentMethodId ?? null,
            round,
            delayedSell,
            nextStep: next ?? null,
            formKeys: Object.keys(form),
          })
        }
      }
    }
  }

  if (sellFormSessionNeedsFinalize(raw)) {
    const next = parseNoahFormNextStep(raw)
    logNoahPayoutFailure("prepare_finalize_incomplete", new Error("form session incomplete"), {
      channelId: input.channelId,
      formSessionIdPrefix: formSessionId.slice(0, 12),
      nextStep: next ?? null,
      formSessionComplete: raw.FormSessionComplete ?? raw.formSessionComplete ?? null,
    })
    assertSellFormSessionReady(result)
  }

  return result
}

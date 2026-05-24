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

export function parsePrepareSellRaw(
  raw: Record<string, unknown>,
  previous?: SellPrepareResult,
): SellPrepareResult {
  const pm = deepFindPaymentMethodId(raw) ?? previous?.paymentMethodId
  const formSessionId = String(
    raw.FormSessionID ?? raw.formSessionId ?? previous?.formSessionId ?? "",
  ).trim()
  const cryptoAuthorizedAmount = String(
    raw.CryptoAuthorizedAmount ?? raw.cryptoAuthorizedAmount ?? previous?.cryptoAuthorizedAmount ?? "",
  ).trim()
  const cryptoAmountEstimate = String(
    raw.CryptoAmountEstimate ?? raw.cryptoAmountEstimate ?? previous?.cryptoAmountEstimate ?? "",
  ).trim()
  const totalFee = String(raw.TotalFee ?? raw.totalFee ?? previous?.totalFee ?? "").trim()
  return {
    formSessionId: formSessionId || undefined,
    cryptoAuthorizedAmount: cryptoAuthorizedAmount || undefined,
    cryptoAmountEstimate: cryptoAmountEstimate || undefined,
    paymentMethodId: pm ?? undefined,
    totalFee: totalFee || undefined,
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

function fullNameFromInitialForm(initialForm: Record<string, unknown>): string {
  const holder = initialForm.AccountHolderName
  if (!holder || typeof holder !== "object") return ""
  const h = holder as Record<string, unknown>
  if (typeof h.Name === "string") return h.Name.trim()
  const name = h.Name
  if (name && typeof name === "object") {
    const n = name as Record<string, unknown>
    const fn = String(n.FirstName ?? "").trim()
    const ln = String(n.LastName ?? "").trim()
    return `${fn} ${ln}`.trim()
  }
  return ""
}

function assignAckName(ctx: Record<string, unknown>, value: string): void {
  const v = value.trim()
  if (!v) return
  ctx.AccountName = v
  ctx.BeneficiaryName = v
  ctx.BeneficiaryAccountName = v
  ctx.AccountHolderName = v
  ctx.ConfirmedBeneficiaryName = v
  ctx.ResolvedAccountName = v
}

/** Pull beneficiary / account-name hints from prepare responses for Cob ack steps. */
export function extractBeneficiaryAckContext(
  raw: Record<string, unknown>,
  initialForm: Record<string, unknown>,
): Record<string, unknown> {
  const ctx: Record<string, unknown> = {}
  assignAckName(ctx, fullNameFromInitialForm(initialForm))

  const walk = (obj: unknown, depth = 0) => {
    if (!obj || typeof obj !== "object" || depth > 10) return
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      if (k === "Schema" || k === "schema" || k === "FormSchema") continue
      if (typeof v === "string" && v.trim()) {
        const key = k.toLowerCase()
        if (
          key === "accountname" ||
          key === "beneficiaryaccountname" ||
          key === "beneficiaryname" ||
          key === "resolvedaccountname" ||
          key === "accountholdername" ||
          key === "nameenquiryaccountname" ||
          /beneficiary.*name/i.test(k) ||
          /account.*name/i.test(k)
        ) {
          assignAckName(ctx, v)
        }
      }
      walk(v, depth + 1)
    }
  }
  walk(raw)
  return ctx
}

function defaultValueForSchemaProperty(
  key: string,
  def: Record<string, unknown>,
  ctx: Record<string, unknown>,
): unknown {
  if (ctx[key] !== undefined) return ctx[key]
  const lower = key.toLowerCase()
  for (const [ck, cv] of Object.entries(ctx)) {
    if (ck.toLowerCase() === lower) return cv
  }
  if (def.const !== undefined) return def.const
  const t = String(def.type ?? "").toLowerCase()
  if (t === "boolean") return true
  if (t === "string") {
    if (/name/i.test(key)) {
      for (const candidate of [
        "AccountName",
        "BeneficiaryAccountName",
        "BeneficiaryName",
        "ConfirmedBeneficiaryName",
      ]) {
        if (typeof ctx[candidate] === "string" && ctx[candidate]) return ctx[candidate]
      }
    }
    return ""
  }
  if (t === "object" && def.properties && typeof def.properties === "object") {
    const nested: Record<string, unknown> = {}
    for (const [nk, nd] of Object.entries(def.properties as Record<string, unknown>)) {
      if (nd && typeof nd === "object") {
        const v = defaultValueForSchemaProperty(nk, nd as Record<string, unknown>, ctx)
        if (v !== "" && v !== undefined) nested[nk] = v
      }
    }
    if (Object.keys(nested).length > 0) return nested
  }
  const enumVals = def.enum as unknown[] | undefined
  if (Array.isArray(enumVals) && enumVals.length > 0) return enumVals[0]
  return undefined
}

/** Build Form payload for Noah Ack steps (e.g. Cob = beneficiary confirmation). */
export function buildAckFormForNextStep(
  next: NoahFormNextStep,
  context: Record<string, unknown> = {},
): Record<string, unknown> {
  const schema = next.schema
  if (schema && typeof schema === "object") {
    const props = schema.properties as Record<string, unknown> | undefined
    const required = Array.isArray(schema.required)
      ? (schema.required as string[]).filter((k) => typeof k === "string")
      : []
    const keys =
      required.length > 0 ? required : props ? Object.keys(props) : []

    if (props && keys.length > 0) {
      const form: Record<string, unknown> = {}
      for (const key of keys) {
        const def = props[key]
        if (!def || typeof def !== "object") continue
        const v = defaultValueForSchemaProperty(key, def as Record<string, unknown>, context)
        if (v !== undefined && v !== "") form[key] = v
        else if ((def as Record<string, unknown>).type === "boolean") form[key] = true
      }
      if (Object.keys(form).length > 0) return form
    }
  }

  const id = next.stepId.trim()
  if (!id) return { Confirmed: true, Acknowledged: true }
  return {
    Confirmed: true,
    Acknowledged: true,
    [id]: { Confirmed: true, Acknowledged: true },
  }
}

function uniqueFormCandidates(
  next: NoahFormNextStep | null,
  initialForm: Record<string, unknown>,
  ackContext: Record<string, unknown>,
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
    const ack = buildAckFormForNextStep(next, ackContext)
    push(ack)
    if (next.stepId) {
      push({ [next.stepId]: ack })
      push({ [next.stepId]: true })
      push({ ...ack, [next.stepId]: true })
    }
    push({ Confirmed: true })
    push({ ConfirmBeneficiary: true })
    push({ Acknowledged: true })
    if (Object.keys(initialForm).length > 0) {
      push({ ...initialForm, ...ack })
    }
    if (next.stepType.toLowerCase() === "dataentry" && Object.keys(initialForm).length > 0) {
      push(initialForm)
    }
  }
  push({})
  return out
}

type PrepareBodyInput = {
  channelId: string
  cryptoCurrency: string
  fiatAmount: string
  customerId?: string
  formSessionId: string
  form: Record<string, unknown>
  delayedSell: boolean
  paymentMethodId?: string
}

function buildPrepareBody(input: PrepareBodyInput): Record<string, unknown> {
  return {
    ChannelID: input.channelId,
    CryptoCurrency: input.cryptoCurrency,
    FiatAmount: input.fiatAmount,
    FormSessionID: input.formSessionId,
    Form: input.form,
    DelayedSell: input.delayedSell,
    ...(input.customerId ? { CustomerID: input.customerId } : {}),
    ...(input.paymentMethodId ? { PaymentMethodID: input.paymentMethodId } : {}),
  }
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

async function runPrepareStep(
  input: PrepareBodyInput,
  previous: SellPrepareResult,
  meta: Record<string, unknown>,
): Promise<SellPrepareResult | null> {
  try {
    const raw = await postSellPrepare(buildPrepareBody(input))
    const result = parsePrepareSellRaw(raw, previous)
    if (!result.formSessionId) return null
    return result
  } catch (e) {
    logNoahPayoutFailure(String(meta.stage ?? "prepare_finalize"), e, meta)
    return null
  }
}

/**
 * Noah requires a final prepare with DelayedSell=false before POST /transactions/sell.
 * Quote-only sessions (DelayedSell=true) can return FormSessionID but 404 on sell.
 */
export async function commitSellFormSessionForExecution(input: {
  channelId: string
  cryptoCurrency: string
  fiatAmount: string
  customerId?: string
  initialForm: Record<string, unknown>
  prep: SellPrepareResult
  lastAckForm?: Record<string, unknown>
}): Promise<SellPrepareResult> {
  const formSessionId = String(input.prep.formSessionId || "").trim()
  if (!formSessionId) return input.prep

  const forms: Record<string, unknown>[] = []
  const seen = new Set<string>()
  const pushForm = (form: Record<string, unknown>) => {
    const key = JSON.stringify(form)
    if (seen.has(key)) return
    seen.add(key)
    forms.push(form)
  }
  if (input.lastAckForm && Object.keys(input.lastAckForm).length > 0) {
    pushForm(input.lastAckForm)
  }
  pushForm({})
  if (Object.keys(input.initialForm).length > 0) pushForm(input.initialForm)

  let result = input.prep
  for (const form of forms) {
    const next = await runPrepareStep(
      {
        channelId: input.channelId,
        cryptoCurrency: input.cryptoCurrency,
        fiatAmount: input.fiatAmount,
        customerId: input.customerId,
        formSessionId: String(result.formSessionId || formSessionId),
        form,
        delayedSell: false,
        paymentMethodId: result.paymentMethodId,
      },
      result,
      {
        channelId: input.channelId,
        formSessionIdPrefix: formSessionId.slice(0, 12),
        stage: "prepare_commit",
        formKeys: Object.keys(form),
      },
    )
    if (next && !sellFormSessionNeedsFinalize(next.raw)) {
      return next
    }
    if (next) result = next
  }

  logNoahPayoutFailure("prepare_commit_incomplete", new Error("execution commit incomplete"), {
    channelId: input.channelId,
    formSessionIdPrefix: formSessionId.slice(0, 12),
    formSessionComplete: result.raw.FormSessionComplete ?? result.raw.formSessionComplete ?? null,
    nextStep: parseNoahFormNextStep(result.raw),
  })
  throw new Error(
    "Payout setup did not finish. Go back and tap Continue for a fresh quote, then try again.",
  )
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
 * submit the Ack/DataEntry payload, then commit with DelayedSell=false before POST /transactions/sell.
 */
export async function finalizeSellFormSessionAfterPrepare(input: {
  channelId: string
  cryptoCurrency: string
  fiatAmount: string
  customerId?: string
  initialForm: Record<string, unknown>
  prep: SellPrepareResult
  /** When true, final prepare with DelayedSell=false (transfer only — not quote). */
  commitForExecution?: boolean
}): Promise<SellPrepareResult> {
  const formSessionId = String(input.prep.formSessionId || "").trim()
  if (!formSessionId) return input.prep

  let raw = input.prep.raw
  let result = input.prep
  let lastAckForm: Record<string, unknown> | undefined
  const ackContext = extractBeneficiaryAckContext(raw, input.initialForm)

  if (sellFormSessionNeedsFinalize(raw)) {
    const tried = new Set<string>()

    for (let round = 0; round < 8 && sellFormSessionNeedsFinalize(raw); round++) {
      const next = parseNoahFormNextStep(raw)
      const forms = uniqueFormCandidates(next, input.initialForm, ackContext)

      for (const delayedSell of [true, false] as const) {
        for (const form of forms) {
          const attemptKey = JSON.stringify({ form, delayedSell, round })
          if (tried.has(attemptKey)) continue
          tried.add(attemptKey)

          const step = await runPrepareStep(
            {
              channelId: input.channelId,
              cryptoCurrency: input.cryptoCurrency,
              fiatAmount: input.fiatAmount,
              customerId: input.customerId,
              formSessionId: String(result.formSessionId || formSessionId),
              form,
              delayedSell,
              paymentMethodId: result.paymentMethodId,
            },
            result,
            {
              channelId: input.channelId,
              formSessionIdPrefix: formSessionId.slice(0, 12),
              paymentMethodId: result.paymentMethodId ?? null,
              round,
              delayedSell,
              nextStep: next ?? null,
              formKeys: Object.keys(form),
            },
          )
          if (!step) continue
          raw = step.raw
          result = step
          if (Object.keys(form).length > 0) lastAckForm = form
          Object.assign(ackContext, extractBeneficiaryAckContext(raw, input.initialForm))
          if (!sellFormSessionNeedsFinalize(raw)) break
        }
        if (!sellFormSessionNeedsFinalize(raw)) break
      }
    }

    if (sellFormSessionNeedsFinalize(raw)) {
      const next = parseNoahFormNextStep(raw)
      const schema = next?.schema
      logNoahPayoutFailure("prepare_finalize_incomplete", new Error("form session incomplete"), {
        channelId: input.channelId,
        formSessionIdPrefix: formSessionId.slice(0, 12),
        nextStep: next ?? null,
        schemaRequired: schema?.required ?? null,
        schemaPropertyKeys:
          schema?.properties && typeof schema.properties === "object"
            ? Object.keys(schema.properties as Record<string, unknown>)
            : null,
        ackContextKeys: Object.keys(ackContext),
        formSessionComplete: raw.FormSessionComplete ?? raw.formSessionComplete ?? null,
      })
      assertSellFormSessionReady(result)
    }
  }

  if (input.commitForExecution) {
    return commitSellFormSessionForExecution({
      channelId: input.channelId,
      cryptoCurrency: input.cryptoCurrency,
      fiatAmount: input.fiatAmount,
      customerId: input.customerId,
      initialForm: input.initialForm,
      prep: result,
      lastAckForm,
    })
  }

  return result
}

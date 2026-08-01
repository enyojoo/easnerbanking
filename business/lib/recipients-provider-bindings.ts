import {
  mergeProviderBindingsIntoMetadata,
  resolveRecipientProviderBindings,
  type RecipientProviderBindings,
} from "@easner/shared"

export function attachProviderBindingsToPayload(input: {
  payload: {
    country_code?: string | null
    currency?: string | null
    bank_name?: string | null
    mobile_provider?: string | null
    metadata?: Record<string, unknown> | null
  }
  corridor: {
    fields_schema?: unknown
    providers?: unknown
  } | null
  rail: "bank_transfer" | "mobile_money"
}): void {
  const cc = String(input.payload.country_code ?? "").trim().toUpperCase()
  const cur = String(input.payload.currency ?? "").trim().toUpperCase()
  if (!cc || !cur || !input.corridor) return

  const bindings = resolveRecipientProviderBindings({
    countryCode: cc,
    currencyCode: cur,
    rail: input.rail,
    bankName: input.payload.bank_name,
    mobileProvider: input.payload.mobile_provider,
    fieldsSchema: input.corridor.fields_schema,
    providers: input.corridor.providers,
  })

  if (!Object.keys(bindings).length) return

  input.payload.metadata = mergeProviderBindingsIntoMetadata(
    input.payload.metadata ?? null,
    bindings,
  )
}

export function computeProviderBindingsForRecipient(input: {
  countryCode: string
  currencyCode: string
  rail: "bank_transfer" | "mobile_money"
  bankName?: string | null
  mobileProvider?: string | null
  fieldsSchema?: unknown
  providers?: unknown
}): RecipientProviderBindings {
  return resolveRecipientProviderBindings({
    countryCode: input.countryCode,
    currencyCode: input.currencyCode,
    rail: input.rail,
    bankName: input.bankName,
    mobileProvider: input.mobileProvider,
    fieldsSchema: input.fieldsSchema,
    providers: input.providers,
  })
}

import { getCountryCodeForCurrency } from "./flags/currency-mapping"
import type { PayoutFieldsSchemaHint } from "./payout-corridor"
import {
  GRID_BANK_NAME_ALIASES,
  isStoredBankNameAllowedForOptions,
  isStoredMomoProviderAllowedForOptions,
  resolveGridBankName,
  resolveGridMomoProvider,
  type GridMomoProviderOption,
} from "./grid-bank-resolve"
import { normalizeYcMomoPhone } from "./yc-momo-phone"

export {
  CORRIDOR_BANK_NAME_ALIASES,
  GRID_BANK_NAME_ALIASES,
  gridBankLabelsMatch,
  normalizeGridBankAccountNumber,
  resolveCorridorBankName,
  resolveCorridorMomoProvider,
  resolveGridBankName,
  resolveGridMomoProvider,
  type GridMomoProviderOption,
} from "./grid-bank-resolve"

/** Provider-specific extras stored on recipients.metadata (LatAm, etc.). */
export type RecipientYcMetadata = {
  pix_key_type?: string
  cuit?: string
  identification_type?: string
  identification_number?: string
  /** COP local account type: cc | ch | dp */
  account_type?: string
}

export type YcRecipientMetadataKey = keyof RecipientYcMetadata

export type YcRecipientFieldDef = {
  key: YcRecipientMetadataKey | "account_number"
  label: string
  required: boolean
  kind: "text" | "select"
  options?: { value: string; label: string }[]
  placeholder?: string
  /** Digits-only validation when set */
  digits?: number
  minDigits?: number
  maxDigits?: number
  /** When true, value is stored on account_number not metadata */
  mapsToAccountNumber?: boolean
}

export type YcCorridorSchemaHint = {
  status: "ready" | "pending_schema"
  channel_type: "bank" | "momo"
  account_number_label?: string
  account_number_hint?: string
  extra_fields?: YcRecipientFieldDef[]
  bank_enum?: string[]
  /** MoMo: value = YC network name, label = display name. */
  momo_provider_enum?: { value: string; label: string }[]
  note?: string
}

export type GridCorridorSchemaHint = {
  status: "ready" | "pending_schema"
  channel_type: "bank" | "momo"
  account_number_label?: string
  account_number_hint?: string
  extra_fields?: YcRecipientFieldDef[]
  /** Canonical Grid bankName values for bank rails. */
  bank_enum?: string[]
  /** MoMo: value = Grid provider/bankName, label = displayName. */
  momo_provider_enum?: { value: string; label: string }[]
  note?: string
}

export type PayoutCorridorFieldsSchema =
  | PayoutFieldsSchemaHint
  | {
      noah?: PayoutFieldsSchemaHint | null
      yellowcard?: YcCorridorSchemaHint | null
      grid?: GridCorridorSchemaHint | null
    }

export type YcRecipientRowLike = {
  country_code?: string | null
  currency: string
  full_name?: string | null
  account_number?: string | null
  bank_name?: string | null
  phone_number?: string | null
  mobile_provider?: string | null
  checking_or_savings?: "checking" | "savings" | null
  metadata?: RecipientYcMetadata | Record<string, unknown> | null
}

export type YcSendMapping = {
  destination: Record<string, unknown>
  root?: Record<string, unknown>
}

const PIX_KEY_TYPES = ["CPF", "CNPJ", "EMAIL", "PHONE", "RANDOM_KEY"] as const

const COP_ID_TYPES: { value: string; label: string }[] = [
  { value: "cc", label: "Citizenship ID (CC)" },
  { value: "nit", label: "Tax ID (NIT)" },
  { value: "ce", label: "Foreigner ID (CE)" },
  { value: "pa", label: "Passport (PA)" },
  { value: "ppt", label: "Temporary Protection Permit (PPT)" },
  { value: "ti", label: "Identity Card (TI)" },
  { value: "rc", label: "Civil Registry (RC)" },
  { value: "te", label: "Foreigner Card (TE)" },
  { value: "die", label: "Foreign ID Document (DIE)" },
  { value: "nd", label: "No Document (ND)" },
]

const COP_ACCOUNT_TYPES: { value: string; label: string }[] = [
  { value: "ch", label: "Savings (default)" },
  { value: "cc", label: "Checking" },
  { value: "dp", label: "Electronic deposit" },
]

/** Static YC field defs per corridor — used by sync script and runtime fallback. */
export const YC_STATIC_CORRIDOR_SCHEMAS: Record<string, YcCorridorSchemaHint> = {
  "NG:NGN": {
    status: "ready",
    channel_type: "bank",
    account_number_label: "Account number",
    account_number_hint: "10-digit NUBAN",
    extra_fields: [],
  },
  "KE:KES": {
    status: "ready",
    channel_type: "bank",
    account_number_label: "Account number",
    extra_fields: [],
  },
  "GH:GHS": {
    status: "ready",
    channel_type: "bank",
    account_number_label: "Account number",
    extra_fields: [],
  },
  "ZA:ZAR": {
    status: "ready",
    channel_type: "bank",
    account_number_label: "Account number",
    extra_fields: [],
  },
  "UG:UGX": {
    status: "ready",
    channel_type: "bank",
    account_number_label: "Account number",
    extra_fields: [],
  },
  "TZ:TZS": {
    status: "ready",
    channel_type: "bank",
    account_number_label: "Account number",
    extra_fields: [],
  },
  "RW:RWF": {
    status: "ready",
    channel_type: "bank",
    account_number_label: "Account number",
    extra_fields: [],
  },
  "MX:MXN": {
    status: "ready",
    channel_type: "bank",
    account_number_label: "CLABE",
    account_number_hint: "18-digit CLABE number",
    extra_fields: [],
  },
  "BR:BRL": {
    status: "ready",
    channel_type: "bank",
    account_number_label: "Pix key",
    account_number_hint: "Pix key value matching the selected key type",
    extra_fields: [
      {
        key: "pix_key_type",
        label: "Pix key type",
        required: true,
        kind: "select",
        options: PIX_KEY_TYPES.map((v) => ({ value: v, label: v })),
      },
    ],
  },
  "AR:ARS": {
    status: "ready",
    channel_type: "bank",
    account_number_label: "CVU / CBU",
    account_number_hint: "22-digit CVU or CBU",
    extra_fields: [
      {
        key: "cuit",
        label: "CUIT",
        required: true,
        kind: "text",
        placeholder: "11-digit tax ID",
        digits: 11,
      },
    ],
  },
  "CO:COP": {
    status: "ready",
    channel_type: "bank",
    account_number_label: "Account number",
    extra_fields: [
      {
        key: "identification_type",
        label: "ID type",
        required: true,
        kind: "select",
        options: COP_ID_TYPES,
      },
      {
        key: "identification_number",
        label: "ID number",
        required: true,
        kind: "text",
      },
      {
        key: "account_type",
        label: "Account type",
        required: false,
        kind: "select",
        options: COP_ACCOUNT_TYPES,
      },
    ],
  },
}

export function ycCorridorSchemaKey(countryCode: string, currencyCode: string): string {
  return `${String(countryCode || "").trim().toUpperCase()}:${String(currencyCode || "").trim().toUpperCase()}`
}

export function isNestedPayoutFieldsSchema(
  fieldsSchema: unknown,
): fieldsSchema is {
  noah?: PayoutFieldsSchemaHint | null
  yellowcard?: YcCorridorSchemaHint | null
  grid?: GridCorridorSchemaHint | null
} {
  if (!fieldsSchema || typeof fieldsSchema !== "object") return false
  const fs = fieldsSchema as Record<string, unknown>
  return "noah" in fs || "yellowcard" in fs || "grid" in fs
}

/** Noah hints from nested or legacy flat fields_schema. */
export function unwrapNoahFieldsSchema(fieldsSchema: unknown): PayoutFieldsSchemaHint | null {
  if (!fieldsSchema || typeof fieldsSchema !== "object") return null
  if (isNestedPayoutFieldsSchema(fieldsSchema)) {
    const noah = fieldsSchema.noah
    return noah && typeof noah === "object" ? (noah as PayoutFieldsSchemaHint) : null
  }
  return fieldsSchema as PayoutFieldsSchemaHint
}

export function unwrapYcFieldsSchema(fieldsSchema: unknown): YcCorridorSchemaHint | null {
  if (!fieldsSchema || typeof fieldsSchema !== "object") return null
  if (!isNestedPayoutFieldsSchema(fieldsSchema)) return null
  const yc = fieldsSchema.yellowcard
  return yc && typeof yc === "object" ? (yc as YcCorridorSchemaHint) : null
}

export function unwrapGridFieldsSchema(fieldsSchema: unknown): GridCorridorSchemaHint | null {
  if (!fieldsSchema || typeof fieldsSchema !== "object") return null
  if (!isNestedPayoutFieldsSchema(fieldsSchema)) return null
  const grid = fieldsSchema.grid
  return grid && typeof grid === "object" ? (grid as GridCorridorSchemaHint) : null
}

/**
 * Build a ready YC corridor schema from Noah payout hints when the corridor row
 * only has Noah configuration (common for NG/KE/etc. switched to YC payout).
 */
export function synthesizeYcSchemaFromNoah(
  noah: PayoutFieldsSchemaHint | null,
): YcCorridorSchemaHint | null {
  if (!noah) return null
  return {
    status: "ready",
    channel_type: "bank",
    account_number_label: "Account number",
    extra_fields: [],
    bank_enum: noah.bank_enum?.length ? noah.bank_enum : undefined,
    note: "Derived from Noah corridor hints for Yellowcard payout",
  }
}

export function resolveYcCorridorSchema(input: {
  countryCode: string
  currencyCode: string
  fieldsSchema?: unknown
}): YcCorridorSchemaHint | null {
  const fromDb = unwrapYcFieldsSchema(input.fieldsSchema)
  if (fromDb?.status === "ready") return fromDb

  const fromNoah = synthesizeYcSchemaFromNoah(unwrapNoahFieldsSchema(input.fieldsSchema))
  if (fromNoah?.bank_enum?.length) return fromNoah

  const key = ycCorridorSchemaKey(input.countryCode, input.currencyCode)
  const staticSchema = YC_STATIC_CORRIDOR_SCHEMAS[key]
  if (staticSchema?.status === "ready") {
    return {
      ...staticSchema,
      bank_enum: staticSchema.bank_enum ?? fromNoah?.bank_enum,
    }
  }

  return fromNoah ?? null
}

export function ycAccountNumberLabel(schema: YcCorridorSchemaHint | null | undefined): string | undefined {
  return schema?.account_number_label
}

export function normalizeRecipientYcMetadata(raw: unknown): RecipientYcMetadata {
  if (!raw || typeof raw !== "object") return {}
  const o = raw as Record<string, unknown>
  const out: RecipientYcMetadata = {}
  if (typeof o.pix_key_type === "string" && o.pix_key_type.trim()) {
    out.pix_key_type = o.pix_key_type.trim().toUpperCase()
  }
  if (typeof o.cuit === "string" && o.cuit.trim()) {
    out.cuit = o.cuit.replace(/\D/g, "")
  }
  if (typeof o.identification_type === "string" && o.identification_type.trim()) {
    out.identification_type = o.identification_type.trim().toLowerCase()
  }
  if (typeof o.identification_number === "string" && o.identification_number.trim()) {
    out.identification_number = o.identification_number.trim()
  }
  if (typeof o.account_type === "string" && o.account_type.trim()) {
    out.account_type = o.account_type.trim().toLowerCase()
  }
  return out
}

function digitsOnly(value: string): string {
  return String(value || "").replace(/\D/g, "")
}

/** YC bank sends require digits-only account numbers (or +phone for rare cases). */
function normalizeYcDestinationAccountNumber(input: {
  country: string
  currency: string
  accountNumber: string
  metadata: RecipientYcMetadata
}): string {
  let accountNumber = String(input.accountNumber ?? "").trim()
  if (!accountNumber) return accountNumber

  const pixType = input.metadata.pix_key_type || ""
  if (input.country === "BR" && input.currency === "BRL") {
    if (pixType === "EMAIL" || pixType === "RANDOM_KEY") return accountNumber
    if (pixType === "CPF" || pixType === "CNPJ" || pixType === "PHONE") return digitsOnly(accountNumber)
    return accountNumber
  }

  if (accountNumber.startsWith("+")) return accountNumber
  return digitsOnly(accountNumber)
}

function validatePixKey(type: string, value: string): string | null {
  const t = type.toUpperCase()
  const v = value.trim()
  if (!v) return "Pix key is required."
  if (t === "CPF") {
    const d = digitsOnly(v)
    if (d.length !== 11) return "CPF Pix key must be 11 digits."
    return null
  }
  if (t === "CNPJ") {
    const d = digitsOnly(v)
    if (d.length !== 14) return "CNPJ Pix key must be 14 digits."
    return null
  }
  if (t === "EMAIL") {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return "Enter a valid email Pix key."
    return null
  }
  if (t === "PHONE") {
    const d = digitsOnly(v)
    if (d.length < 10 || d.length > 11) return "Phone Pix key must be 10–11 digits."
    return null
  }
  if (t === "RANDOM_KEY") {
    if (!v.includes("-")) return "Random Pix key must be UUID format."
    return null
  }
  return "Select a valid Pix key type."
}

function validateExtraField(field: YcRecipientFieldDef, metadata: RecipientYcMetadata, accountNumber: string): string | null {
  if (field.mapsToAccountNumber || field.key === "account_number") {
    const acct = accountNumber.trim()
    if (field.required && !acct) return `${field.label} is required.`
    if (field.digits != null && acct) {
      const d = digitsOnly(acct)
      if (d.length !== field.digits) return `${field.label} must be ${field.digits} digits.`
    }
    return null
  }
  const val = metadata[field.key as YcRecipientMetadataKey]
  const text = typeof val === "string" ? val.trim() : ""
  if (field.required && !text) return `${field.label} is required.`
  if (!text) return null
  if (field.digits != null) {
    const d = field.key === "cuit" ? digitsOnly(text) : text
    const len = field.key === "cuit" ? digitsOnly(text).length : d.length
    if (len !== field.digits) return `${field.label} must be ${field.digits} digits.`
  }
  if (field.kind === "select" && field.options?.length) {
    const allowed = new Set(field.options.map((o) => o.value))
    if (!allowed.has(text)) return `Select a valid ${field.label.toLowerCase()}.`
  }
  return null
}

/** Validate saved recipient row against YC corridor schema (quote-time + save-time). */
export function validateYcRecipientForCorridor(input: {
  countryCode: string
  currencyCode: string
  row: YcRecipientRowLike
  fieldsSchema?: unknown
}): { ok: true } | { ok: false; message: string } {
  const cc = String(input.countryCode || "").trim().toUpperCase()
  const cur = String(input.currencyCode || "").trim().toUpperCase()
  if (!cc || !cur) return { ok: false, message: "Recipient country is required for Yellowcard payout." }

  const schema =
    resolveYcCorridorSchema({
      countryCode: cc,
      currencyCode: cur,
      fieldsSchema: input.fieldsSchema,
    }) ?? null

  if (!schema || schema.status !== "ready") {
    return { ok: false, message: "Yellowcard recipient fields are not configured for this corridor." }
  }

  const metadata = normalizeRecipientYcMetadata(input.row.metadata)
  const accountNumber = String(input.row.account_number || "").trim()
  const bankName = String(input.row.bank_name || "").trim()
  const isMomo =
    Boolean(input.row.mobile_provider) || bankName.toLowerCase().includes("mobile money")

  if (isMomo) {
    if (!String(input.row.phone_number || accountNumber).trim()) {
      return { ok: false, message: "Mobile money recipient requires a phone number." }
    }
    return { ok: true }
  }

  if (!String(input.row.full_name || "").trim()) {
    return { ok: false, message: "Recipient name is required." }
  }

  // Corridor-specific account number rules
  if (cc === "MX" && cur === "MXN") {
    const clabe = digitsOnly(accountNumber)
    if (clabe.length !== 18) return { ok: false, message: "Mexico CLABE must be 18 digits." }
  } else if (cc === "AR" && cur === "ARS") {
    const cvu = digitsOnly(accountNumber)
    if (cvu.length !== 22) return { ok: false, message: "Argentina CVU/CBU must be 22 digits." }
  } else if (cc === "BR" && cur === "BRL") {
    const pixType = metadata.pix_key_type || ""
    if (!pixType) return { ok: false, message: "Pix key type is required for Brazil." }
    const pixErr = validatePixKey(pixType, accountNumber)
    if (pixErr) return { ok: false, message: pixErr }
  } else if (!accountNumber) {
    return { ok: false, message: "Account number is required." }
  }

  for (const field of schema.extra_fields ?? []) {
    const err = validateExtraField(field, metadata, accountNumber)
    if (err) return { ok: false, message: err }
  }

  if (schema.bank_enum?.length && bankName) {
    const options = resolveCorridorRecipientOptions({
      countryCode: cc,
      currencyCode: cur,
      rail: isMomo ? "mobile_money" : "bank_transfer",
      fieldsSchema: input.fieldsSchema,
    })
    if (!isBankNameAllowedForCorridor(bankName, options)) {
      return { ok: false, message: "Select a bank from the corridor list." }
    }
  }

  return { ok: true }
}

/** Resolve ISO2 country for YC send when recipient rows omit country_code (e.g. KES → KE). */
export function resolveYcRecipientCountry(row: {
  country_code?: string | null
  currency?: string | null
}): string {
  const fromRow = String(row.country_code ?? "").trim().toUpperCase()
  if (fromRow) return fromRow
  const cur = String(row.currency ?? "").trim().toUpperCase()
  if (!cur) return ""
  const mapped = getCountryCodeForCurrency(cur)
  return mapped ? mapped.toUpperCase() : ""
}

/** Build YC /send destination + root-level LatAm fields from a saved recipient row. */
export function buildYcSendMappingFromRecipient(
  row: YcRecipientRowLike,
  input?: { networkId?: string | null },
): YcSendMapping {
  const country = resolveYcRecipientCountry(row)
  const currency = String(row.currency || "").trim().toUpperCase()
  const metadata = normalizeRecipientYcMetadata(row.metadata)
  const name = String(row.full_name ?? "").trim()
  const phone = String(row.phone_number ?? "").trim()
  let accountNumber = String(row.account_number ?? "").trim()
  const bankName = String(row.bank_name ?? "").trim()
  const mobileProvider = String(row.mobile_provider ?? "").trim()

  const isMomo =
    Boolean(mobileProvider) ||
    bankName.toLowerCase().includes("mobile money") ||
    Boolean(phone && !accountNumber)

  if (isMomo) {
    const rawPhone = phone || accountNumber
    const normalizedPhone =
      rawPhone && country ? normalizeYcMomoPhone(rawPhone, country) : rawPhone
    const destination: Record<string, unknown> = {
      accountName: name || undefined,
      accountType: "momo",
    }
    if (normalizedPhone) {
      destination.accountNumber = normalizedPhone
      destination.phoneNumber = normalizedPhone
    }
    if (input?.networkId) destination.networkId = input.networkId
    return { destination }
  }

  accountNumber = normalizeYcDestinationAccountNumber({
    country,
    currency,
    accountNumber,
    metadata,
  })

  const destination: Record<string, unknown> = {
    accountName: name || undefined,
    accountNumber: accountNumber || undefined,
    accountType: "bank",
  }

  if (country === "BR" && metadata.pix_key_type) {
    destination.pixKeyType = metadata.pix_key_type
  }

  if (input?.networkId) destination.networkId = input.networkId
  if (bankName && !bankName.toLowerCase().includes("mobile money")) {
    destination.accountBank = bankName
  }

  const root: Record<string, unknown> = {}
  if (country === "AR" && metadata.cuit) {
    root.cuit = metadata.cuit
  }
  if (country === "CO" && currency === "COP") {
    if (metadata.identification_type) root.identificationType = metadata.identification_type
    if (metadata.identification_number) root.identificationNumber = metadata.identification_number
    const acctType =
      metadata.account_type ||
      (row.checking_or_savings === "checking"
        ? "cc"
        : row.checking_or_savings === "savings"
          ? "ch"
          : undefined)
    if (acctType) root.accountType = acctType
  }

  return {
    destination,
    ...(Object.keys(root).length > 0 ? { root } : {}),
  }
}

/** Merge YC network list into corridor schema bank_enum + default network hints. */
export function mergeYcNetworksIntoSchema(
  schema: YcCorridorSchemaHint,
  networks: Array<{ id?: string; networkId?: string; code?: string; name?: string; status?: string }>,
): YcCorridorSchemaHint {
  const active = networks.filter((n) => String(n.status ?? "").toLowerCase() !== "inactive")
  const bankNames = active
    .map((n) => String(n.name ?? n.code ?? "").trim())
    .filter(Boolean)
  const unique = [...new Set(bankNames)]
  if (!unique.length) return schema
  return {
    ...schema,
    bank_enum: unique,
  }
}

export type CorridorRecipientCandidates = {
  bankNames: string[]
  momoLabels: string[]
  momoCandidates: GridMomoProviderOption[]
}

function momoOption(value: string, label?: string): GridMomoProviderOption {
  const v = value.trim()
  return { value: v, label: (label ?? v).trim() || v }
}

function appendMomoOptions(
  out: Map<string, GridMomoProviderOption>,
  entries: GridMomoProviderOption[],
): void {
  for (const entry of entries) {
    const value = String(entry.value ?? "").trim()
    if (!value) continue
    const label = String(entry.label ?? value).trim() || value
    out.set(value.toLowerCase(), { value, label })
  }
}

/** Union or primary-scoped Noah / YC / Grid bank_enum and MoMo provider names. */
export function extractCorridorRecipientCandidates(input: {
  countryCode?: string
  currencyCode?: string
  rail?: "bank_transfer" | "mobile_money"
  fieldsSchema?: unknown
  providers?: unknown
  /** When set, only that provider's schema is used (manual Office routing). */
  payoutProvider?: "noah" | "yellowcard" | "grid" | null
}): CorridorRecipientCandidates {
  const primary = input.payoutProvider ?? null
  const noah =
    !primary || primary === "noah" ? unwrapNoahFieldsSchema(input.fieldsSchema) : null
  const yc =
    !primary || primary === "yellowcard"
      ? input.countryCode && input.currencyCode
        ? resolveYcCorridorSchema({
            countryCode: input.countryCode,
            currencyCode: input.currencyCode,
            fieldsSchema: input.fieldsSchema,
          })
        : unwrapYcFieldsSchema(input.fieldsSchema)
      : null
  const grid =
    !primary || primary === "grid" ? unwrapGridFieldsSchema(input.fieldsSchema) : null

  const bankNames = uniqueStrings([
    ...(noah?.bank_enum ?? []),
    ...(yc?.bank_enum ?? []),
    ...(grid?.bank_enum ?? []),
  ])

  const momoMap = new Map<string, GridMomoProviderOption>()
  if (!primary || primary === "noah" || primary === "yellowcard" || primary === "grid") {
    appendMomoOptions(
      momoMap,
      (Array.isArray(input.providers) ? input.providers : []).map((p) =>
        momoOption(String(p)),
      ),
    )
  }
  if (!primary || primary === "noah") {
    appendMomoOptions(
      momoMap,
      (noah?.mobile_provider_labels ?? []).map((label) => momoOption(label)),
    )
  }
  if (!primary || primary === "yellowcard") {
    appendMomoOptions(momoMap, yc?.momo_provider_enum ?? [])
  }
  if (!primary || primary === "grid") {
    appendMomoOptions(momoMap, grid?.momo_provider_enum ?? [])
  }

  const momoCandidates = [...momoMap.values()].sort((a, b) => a.label.localeCompare(b.label))
  const momoLabels = uniqueStrings([
    ...(!primary || primary === "noah" || primary === "yellowcard" || primary === "grid"
      ? Array.isArray(input.providers)
        ? (input.providers as unknown[]).map((p) => String(p))
        : []
      : []),
    ...(noah?.mobile_provider_labels ?? []),
    ...(yc?.momo_provider_enum ?? []).map((entry) => entry.label || entry.value),
    ...(grid?.momo_provider_enum ?? []).map((entry) => entry.label || entry.value),
    ...momoCandidates.map((entry) => entry.label),
  ])

  return { bankNames, momoLabels, momoCandidates }
}

export type CorridorRecipientOptions = {
  bankOptions: string[]
  momoOptions: string[]
  momoCandidates: GridMomoProviderOption[]
  extraFields: YcRecipientFieldDef[]
  accountNumberLabel?: string
  accountNumberHint?: string
}

function uniqueStrings(values: Array<string | undefined | null>): string[] {
  return [...new Set(values.map((v) => String(v ?? "").trim()).filter(Boolean))]
}

/** Provider-scoped recipient UI options — primary Office provider when set, else union. */
export function resolveCorridorRecipientOptions(input: {
  countryCode: string
  currencyCode: string
  rail: "bank_transfer" | "mobile_money"
  fieldsSchema?: unknown
  providers?: unknown
  /** Office primary payout provider — scopes banks/extras to that rail. */
  payoutProvider?: "noah" | "yellowcard" | "grid" | null
}): CorridorRecipientOptions {
  const primary = input.payoutProvider ?? null
  const candidates = extractCorridorRecipientCandidates({
    countryCode: input.countryCode,
    currencyCode: input.currencyCode,
    rail: input.rail,
    fieldsSchema: input.fieldsSchema,
    providers: input.providers,
    payoutProvider: primary,
  })
  const yc =
    !primary || primary === "yellowcard"
      ? resolveYcCorridorSchema({
          countryCode: input.countryCode,
          currencyCode: input.currencyCode,
          fieldsSchema: input.fieldsSchema,
        })
      : null
  const grid =
    !primary || primary === "grid" ? unwrapGridFieldsSchema(input.fieldsSchema) : null
  const schemaForExtras =
    primary === "grid" ? grid : primary === "yellowcard" ? yc : primary === "noah" ? null : yc ?? grid

  return {
    bankOptions: candidates.bankNames,
    momoOptions: candidates.momoLabels,
    momoCandidates: candidates.momoCandidates,
    extraFields: schemaForExtras?.extra_fields ?? [],
    accountNumberLabel:
      schemaForExtras?.account_number_label ??
      (input.rail === "mobile_money" ? "Phone number" : "Account number"),
    accountNumberHint: schemaForExtras?.account_number_hint,
  }
}

export function isBankNameAllowedForCorridor(bankName: string, options: CorridorRecipientOptions): boolean {
  return isStoredBankNameAllowedForOptions(bankName, options.bankOptions)
}

export function isMomoProviderAllowedForCorridor(
  provider: string,
  options: CorridorRecipientOptions,
): boolean {
  return isStoredMomoProviderAllowedForOptions(
    provider,
    options.momoOptions,
    options.momoCandidates,
  )
}

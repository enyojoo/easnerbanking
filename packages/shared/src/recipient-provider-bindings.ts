import {
  resolveCorridorBankName,
  resolveCorridorMomoProvider,
  type GridMomoProviderOption,
} from "./grid-bank-resolve"
import type { PayoutFieldsSchemaHint } from "./payout-corridor"
import {
  unwrapGridFieldsSchema,
  unwrapNoahFieldsSchema,
  unwrapYcFieldsSchema,
  type GridCorridorSchemaHint,
  type YcCorridorSchemaHint,
} from "./yc-recipient-schema"

export type PayoutBindingProviderId = "noah" | "yellowcard" | "grid" | "bridge"

export type RecipientProviderBinding = {
  bankName?: string
  network?: string
}

export type RecipientProviderBindings = {
  yellowcard?: RecipientProviderBinding
  grid?: RecipientProviderBinding
  noah?: RecipientProviderBinding
  bridge?: RecipientProviderBinding
}

export const RECIPIENT_PROVIDER_BINDINGS_KEY = "provider_bindings"

function isMobileRail(input: {
  mobileProvider?: string | null
  bankName?: string | null
}): boolean {
  if (String(input.mobileProvider ?? "").trim()) return true
  return String(input.bankName ?? "").toLowerCase().includes("mobile money")
}

function momoCandidatesFromProviders(providers: unknown): GridMomoProviderOption[] {
  if (!Array.isArray(providers)) return []
  return providers
    .map((p) => String(p ?? "").trim())
    .filter(Boolean)
    .map((value) => ({ value, label: value }))
}

function bindingForBank(storedBankName: string, bankEnum: string[] | undefined): RecipientProviderBinding | null {
  const trimmed = String(storedBankName ?? "").trim()
  if (!trimmed) return null
  const resolved = resolveCorridorBankName(trimmed, bankEnum?.length ? bankEnum : undefined)
  if (!resolved) return null
  return { bankName: resolved }
}

function bindingForMomo(
  storedNetwork: string,
  momoEnum: GridMomoProviderOption[] | undefined,
  providerLabels: string[] | undefined,
): RecipientProviderBinding | null {
  const trimmed = String(storedNetwork ?? "").trim()
  if (!trimmed) return null
  const candidates =
    momoEnum?.length ? momoEnum : momoCandidatesFromProviders(providerLabels)
  const resolved = resolveCorridorMomoProvider(trimmed, candidates.length ? candidates : undefined)
  if (!resolved) return null
  return { network: resolved }
}

function noahBankEnum(noah: PayoutFieldsSchemaHint | null): string[] | undefined {
  return noah?.bank_enum?.length ? noah.bank_enum : undefined
}

function noahMomoLabels(noah: PayoutFieldsSchemaHint | null): string[] | undefined {
  return noah?.mobile_provider_labels?.length ? noah.mobile_provider_labels : undefined
}

function ycSchemaForBindings(fieldsSchema: unknown): YcCorridorSchemaHint | null {
  const fromDb = unwrapYcFieldsSchema(fieldsSchema)
  if (fromDb?.status === "ready") return fromDb
  return null
}

function gridSchemaForBindings(fieldsSchema: unknown): GridCorridorSchemaHint | null {
  const grid = unwrapGridFieldsSchema(fieldsSchema)
  if (!grid || grid.status === "pending_schema") return null
  return grid
}

/** Compute per-provider bank/network bindings from display labels + corridor schemas. */
export function resolveRecipientProviderBindings(input: {
  countryCode: string
  currencyCode: string
  rail: "bank_transfer" | "mobile_money"
  bankName?: string | null
  mobileProvider?: string | null
  fieldsSchema?: unknown
  providers?: unknown
}): RecipientProviderBindings {
  const cc = String(input.countryCode ?? "").trim().toUpperCase()
  const cur = String(input.currencyCode ?? "").trim().toUpperCase()
  if (!cc || !cur) return {}

  const mobile = input.rail === "mobile_money" || isMobileRail(input)
  const storedBank = String(input.bankName ?? "").trim()
  const storedNetwork = String(input.mobileProvider ?? "").trim()

  const out: RecipientProviderBindings = {}

  const noah = unwrapNoahFieldsSchema(input.fieldsSchema)
  if (noah) {
    const b = mobile
      ? bindingForMomo(storedNetwork || storedBank, undefined, noahMomoLabels(noah))
      : bindingForBank(storedBank, noahBankEnum(noah))
    if (b) out.noah = b
  }

  const yc = ycSchemaForBindings(input.fieldsSchema)
  if (yc && yc.status === "ready") {
    const b = mobile
      ? bindingForMomo(storedNetwork || storedBank, yc.momo_provider_enum, undefined)
      : bindingForBank(storedBank, yc.bank_enum)
    if (b) out.yellowcard = b
  }

  const grid = gridSchemaForBindings(input.fieldsSchema)
  if (grid) {
    const b = mobile
      ? bindingForMomo(
          storedNetwork || storedBank,
          grid.momo_provider_enum,
          Array.isArray(input.providers) ? (input.providers as string[]) : undefined,
        )
      : bindingForBank(storedBank, grid.bank_enum)
    if (b) out.grid = b
  }

  return out
}

export function readProviderBinding(
  metadata: Record<string, unknown> | null | undefined,
  provider: PayoutBindingProviderId,
): RecipientProviderBinding | null {
  if (!metadata || typeof metadata !== "object") return null
  const raw = metadata[RECIPIENT_PROVIDER_BINDINGS_KEY]
  if (!raw || typeof raw !== "object") return null
  const entry = (raw as RecipientProviderBindings)[provider]
  if (!entry || typeof entry !== "object") return null
  return entry
}

export function mergeProviderBindings(
  existing: RecipientProviderBindings | null | undefined,
  next: RecipientProviderBindings,
): RecipientProviderBindings {
  return {
    ...(existing ?? {}),
    ...(next.yellowcard ? { yellowcard: { ...existing?.yellowcard, ...next.yellowcard } } : {}),
    ...(next.grid ? { grid: { ...existing?.grid, ...next.grid } } : {}),
    ...(next.noah ? { noah: { ...existing?.noah, ...next.noah } } : {}),
  }
}

export function mergeProviderBindingsIntoMetadata(
  metadata: Record<string, unknown> | null | undefined,
  bindings: RecipientProviderBindings,
): Record<string, unknown> {
  const base = metadata && typeof metadata === "object" ? { ...metadata } : {}
  const prior = readAllProviderBindings(base)
  base[RECIPIENT_PROVIDER_BINDINGS_KEY] = mergeProviderBindings(prior, bindings)
  return base
}

export function readAllProviderBindings(
  metadata: Record<string, unknown> | null | undefined,
): RecipientProviderBindings {
  if (!metadata || typeof metadata !== "object") return {}
  const raw = metadata[RECIPIENT_PROVIDER_BINDINGS_KEY]
  if (!raw || typeof raw !== "object") return {}
  return raw as RecipientProviderBindings
}

export type RecipientBindingRowLike = {
  bank_name?: string | null
  mobile_provider?: string | null
  metadata?: Record<string, unknown> | null
}

/** Overlay provider-specific bank/network labels for quote/execute. */
export function applyProviderBindingToRecipient<T extends RecipientBindingRowLike>(
  row: T,
  provider: PayoutBindingProviderId,
): T {
  const binding = readProviderBinding(row.metadata ?? null, provider)
  if (!binding) return row
  return {
    ...row,
    ...(binding.bankName ? { bank_name: binding.bankName } : {}),
    ...(binding.network ? { mobile_provider: binding.network } : {}),
  }
}

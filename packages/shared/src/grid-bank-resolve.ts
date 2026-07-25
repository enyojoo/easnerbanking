export type GridMomoProviderOption = { value: string; label: string }

/** User-facing / Noah / YC label → canonical bankName or provider value. */
export const CORRIDOR_BANK_NAME_ALIASES: Record<string, string> = {
  "M-PESA": "M-Pesa",
  "M-Pesa": "M-Pesa",
  MPESA: "M-Pesa",
  Mpesa: "M-Pesa",
  "Airtel Money": "Airtel Money",
  // Nigeria — Noah short names → Grid discoveries
  Kuda: "Kuda Microfinance Bank",
  GTBank: "GT Bank",
  "Guaranty Trust Bank": "GT Bank",
  "Guaranty Trust Bank (GTBank)": "GT Bank",
  UBA: "United Bank For Africa",
  "First Bank": "First Bank Of Nigeria",
  "First Bank of Nigeria": "First Bank Of Nigeria",
  FCMB: "Fcmb",
  "Stanbic IBTC": "Stanbic Ibtc Bank",
  "Stanbic IBTC Bank": "Stanbic Ibtc Bank",
  "Polaris Bank": "Polaris Bank",
  "Union Bank": "Union Bank Of Nigeria",
  "Unity Bank": "Unity Bank",
  "Wema Bank": "Wema Bank",
  "Ecobank Nigeria": "Ecobank Bank",
  Ecobank: "Ecobank Bank",
  // Kenya
  "Equity Bank": "Equity Bank",
  "Co-operative Bank": "Co-Operative Bank",
  "Cooperative Bank": "Co-Operative Bank",
  // Ghana
  "GCB Bank": "Gcb Bank",
  GCB: "Gcb Bank",
}

/** @deprecated Use CORRIDOR_BANK_NAME_ALIASES */
export const GRID_BANK_NAME_ALIASES = CORRIDOR_BANK_NAME_ALIASES

function normalizeGridBankLabel(value: string): string {
  return value
    .toLowerCase()
    .replace(/\b(plc|ltd|limited|nigeria|ng|microfinance|mfb)\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
}

/** Fuzzy match stored recipient bank labels across provider bank_enum values. */
export function gridBankLabelsMatch(stored: string, candidate: string): boolean {
  const n = normalizeGridBankLabel(stored)
  const h = normalizeGridBankLabel(candidate)
  if (!n || !h) return false
  if (n === h) return true
  const compactStored = n.replace(/\s+/g, "")
  const compactCandidate = h.replace(/\s+/g, "")
  if (compactStored && compactStored === compactCandidate) return true
  return h.includes(n) || n.includes(h)
}

function resolveGridAlias(storedName: string): string | undefined {
  const trimmed = storedName.trim()
  if (!trimmed) return undefined
  if (CORRIDOR_BANK_NAME_ALIASES[trimmed]) return CORRIDOR_BANK_NAME_ALIASES[trimmed]
  const lower = trimmed.toLowerCase()
  for (const [key, value] of Object.entries(CORRIDOR_BANK_NAME_ALIASES)) {
    if (key.toLowerCase() === lower) return value
  }
  return undefined
}

function pickFromCandidates(storedName: string, candidates: string[]): string | undefined {
  const trimmed = storedName.trim()
  if (!trimmed || !candidates.length) return undefined

  const exact = candidates.find((c) => c === trimmed)
  if (exact) return exact

  const aliased = resolveGridAlias(trimmed)
  if (aliased) {
    const aliasExact = candidates.find((c) => c === aliased)
    if (aliasExact) return aliasExact
  }

  const search = aliased ?? trimmed
  return candidates.find((c) => gridBankLabelsMatch(search, c))
}

/**
 * Map a saved recipient bank_name to a canonical value for the active provider.
 * Uses static aliases first, then fuzzy match against synced corridor bank_enum when provided.
 */
export function resolveCorridorBankName(storedBankName: string, candidates?: string[]): string {
  return resolveGridBankName(storedBankName, candidates)
}

/**
 * Map a saved recipient bank_name to Grid's canonical bankName.
 * Uses static aliases first, then fuzzy match against synced corridor bank_enum when provided.
 */
export function resolveGridBankName(storedBankName: string, candidates?: string[]): string {
  const trimmed = String(storedBankName || "").trim()
  if (!trimmed) return trimmed

  const fromCandidates = candidates?.length ? pickFromCandidates(trimmed, candidates) : undefined
  if (fromCandidates) return fromCandidates

  return resolveGridAlias(trimmed) ?? trimmed
}

/** Map saved mobile_provider to a canonical provider label/value. */
export function resolveCorridorMomoProvider(
  storedProvider: string,
  candidates?: GridMomoProviderOption[],
): string {
  return resolveGridMomoProvider(storedProvider, candidates)
}

/** Map saved mobile_provider to Grid provider/bankName value. */
export function resolveGridMomoProvider(
  storedProvider: string,
  candidates?: GridMomoProviderOption[],
): string {
  const trimmed = String(storedProvider || "").trim()
  if (!trimmed) return trimmed

  if (candidates?.length) {
    const exactValue = candidates.find((c) => c.value === trimmed || c.label === trimmed)
    if (exactValue) return exactValue.value

    const aliased = resolveGridAlias(trimmed)
    if (aliased) {
      const aliasMatch = candidates.find((c) => c.value === aliased || c.label === aliased)
      if (aliasMatch) return aliasMatch.value
    }

    const search = aliased ?? trimmed
    const fuzzy = candidates.find(
      (c) => gridBankLabelsMatch(search, c.value) || gridBankLabelsMatch(search, c.label),
    )
    if (fuzzy) return fuzzy.value
  }

  return resolveGridAlias(trimmed) ?? trimmed
}

export function isStoredBankNameAllowedForOptions(
  storedBankName: string,
  bankOptions: string[],
): boolean {
  const name = String(storedBankName || "").trim()
  if (!name || !bankOptions.length) return true
  if (bankOptions.includes(name)) return true
  const resolved = resolveGridBankName(name, bankOptions)
  if (bankOptions.includes(resolved)) return true
  return bankOptions.some((candidate) => gridBankLabelsMatch(name, candidate))
}

/** Strip display formatting before Grid external-account create. NGN NUBAN is 10 digits. */
export function normalizeGridBankAccountNumber(currency: string, raw: string): string {
  const cur = currency.trim().toUpperCase()
  const compact = String(raw ?? "").replace(/\s+/g, "").trim()
  if (cur === "NGN") {
    const digits = compact.replace(/\D/g, "")
    if (digits.length > 10) {
      throw new Error("Nigerian bank account numbers must be at most 10 digits.")
    }
    return digits
  }
  return compact
}

export function isStoredMomoProviderAllowedForOptions(
  storedProvider: string,
  momoOptions: string[],
  momoCandidates?: GridMomoProviderOption[],
): boolean {
  const label = String(storedProvider || "").trim()
  if (!label || !momoOptions.length) return true
  if (momoOptions.includes(label)) return true
  const resolved = resolveGridMomoProvider(label, momoCandidates)
  if (momoOptions.includes(resolved)) return true
  return momoOptions.some(
    (candidate) => gridBankLabelsMatch(label, candidate) || gridBankLabelsMatch(resolved, candidate),
  )
}

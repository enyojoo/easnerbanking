/** Row fields used for payout recipient subtitles (bank / mobile money / wallet). */
export type PayoutRecipientSubtitleInput = {
  bankName?: string | null
  phone?: string | null
  mobileProvider?: string | null
  iban?: string | null
  accountNumber?: string | null
  fullAccountNumber?: string | null
  walletNetwork?: string | null
  swiftBic?: string | null
  /** When set, subtitle parts are empty (Easetag uses its own row). */
  payeeEasetag?: string | null
}

export function formatAccountNumberDigits(value: string): string {
  const digits = String(value || "").replace(/\D/g, "")
  return digits.replace(/(\d{4})(?=\d)/g, "$1 ").trim()
}

export function formatIbanDisplay(value: string): string {
  const cleaned = String(value || "").replace(/\s/g, "").toUpperCase()
  return cleaned.replace(/(.{4})/g, "$1 ").trim()
}

function isEasetagRow(input: PayoutRecipientSubtitleInput): boolean {
  return Boolean(String(input.payeeEasetag || "").trim())
}

export function isMobileMoneyPayoutRow(input: PayoutRecipientSubtitleInput): boolean {
  const bank = String(input.bankName || "").toLowerCase()
  return bank.includes("mobile money") || Boolean(input.mobileProvider)
}

export function isWalletPayoutRow(input: PayoutRecipientSubtitleInput): boolean {
  const bank = String(input.bankName || "").toLowerCase()
  return bank.includes("wallet") || Boolean(input.walletNetwork)
}

function parseMobileProviderFromBank(bankName: string): string {
  const m = String(bankName || "").match(/^Mobile Money \(([^)]+)\)/i)
  if (!m?.[1]) return ""
  const inner = m[1]
  const ccIdx = inner.lastIndexOf("|CC:")
  const providerPart = ccIdx >= 0 ? inner.slice(0, ccIdx) : inner
  return providerPart.split("|")[0].trim()
}

function normalizeProviderLabel(raw: string | undefined): string {
  const s = String(raw || "").trim()
  if (!s) return ""
  const first = s.split(/\s+/)[0] || s
  if (first.length <= 4 && first === first.toUpperCase()) return first
  return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase()
}

function formatMobilePhoneDisplay(phone: string | undefined | null): string {
  const t = String(phone || "").trim()
  if (!t) return ""
  const compact = t.replace(/[^\d+]/g, "")
  if (compact.startsWith("+")) {
    return `+${compact.slice(1).replace(/\D/g, "")}`
  }
  const d = compact.replace(/\D/g, "")
  if (d.length >= 8) return `+${d}`
  return t
}

function bankNameLead(bankName: string): string {
  const s = String(bankName || "").trim()
  if (!s) return "Bank"
  const first = s.split(/\s+/)[0] || s
  return first.length > 20 ? `${first.slice(0, 18)}…` : first
}

export function truncateMiddle(s: string, start = 6, end = 6): string {
  const t = s.trim()
  if (!t) return ""
  if (t.length <= start + end + 3) return t
  return `${t.slice(0, start)}...${t.slice(-end)}`
}

function formatBankAccountDisplay(input: PayoutRecipientSubtitleInput): string {
  const iban = String(input.iban || "").replace(/\s/g, "").trim()
  const acct = String(input.fullAccountNumber || input.accountNumber || "").trim()
  if (iban) {
    return formatIbanDisplay(iban)
  }
  if (acct) {
    if (/^0x[a-fA-F0-9]+$/.test(acct)) {
      return truncateMiddle(acct, 6, 6)
    }
    const digits = acct.replace(/\D/g, "")
    if (digits.length >= 8) {
      return formatAccountNumberDigits(digits)
    }
    return acct
  }
  return ""
}

function walletNetworkLabel(input: PayoutRecipientSubtitleInput): string {
  if (String(input.walletNetwork || "").trim()) {
    const w = String(input.walletNetwork).trim()
    return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()
  }
  const m = String(input.bankName || "").match(/^Wallet \((.*)\)$/i)
  if (!m?.[1]) return "Wallet"
  const inner = m[1].trim()
  if (inner.includes("/")) {
    const parts = inner.split("/")
    const network = (parts[1] || parts[0]).trim()
    return network || "Wallet"
  }
  return inner || "Wallet"
}

/**
 * Subtitle parts for mobile money, bank, and wallet — `left • right`
 * (e.g. `GTBank • 0123 4567`, `MTN • +234…`, `Ethereum • 0x1a2b...c3d4`).
 */
export function getPayoutRecipientSubtitleParts(
  input: PayoutRecipientSubtitleInput,
): { left: string; right: string } {
  if (isEasetagRow(input)) {
    return { left: "", right: "" }
  }

  if (isMobileMoneyPayoutRow(input)) {
    const fromField = normalizeProviderLabel(input.mobileProvider ?? undefined)
    const fromBank = normalizeProviderLabel(parseMobileProviderFromBank(String(input.bankName || "")))
    const left = fromField || fromBank || "Mobile"
    const right = formatMobilePhoneDisplay(
      input.phone || input.fullAccountNumber || input.accountNumber,
    )
    return { left, right }
  }

  if (isWalletPayoutRow(input)) {
    const left = walletNetworkLabel(input)
    const addr = String(
      input.fullAccountNumber || input.accountNumber || input.swiftBic || "",
    ).trim()
    const right = addr ? truncateMiddle(addr, 6, 6) : ""
    return { left, right }
  }

  const left = bankNameLead(String(input.bankName || ""))
  const right = formatBankAccountDisplay(input)
  return { left, right: right || "" }
}

export function formatPayoutRecipientSubtitle(input: PayoutRecipientSubtitleInput): string {
  const { left, right } = getPayoutRecipientSubtitleParts(input)
  if (left && right) return `${left} • ${right}`
  return left || right || ""
}

export function beneficiaryToPayoutSubtitleInput(b: {
  bankName: string
  phone?: string
  mobileProvider?: string
  iban?: string
  accountNumber: string
  fullAccountNumber: string
  walletNetwork?: string
  bic?: string
  payeeEasetag?: string
}): PayoutRecipientSubtitleInput {
  return {
    bankName: b.bankName,
    phone: b.phone,
    mobileProvider: b.mobileProvider,
    iban: b.iban,
    accountNumber: b.accountNumber,
    fullAccountNumber: b.fullAccountNumber,
    walletNetwork: b.walletNetwork,
    swiftBic: b.bic,
    payeeEasetag: b.payeeEasetag,
  }
}

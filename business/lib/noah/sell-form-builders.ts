/**
 * Noah Global Payout — map Easner recipient + send fields to sell/prepare Form objects.
 * @see https://github.com/noah-labs/public-schemas
 */

export type AccountHolderNameInput = {
  fullName: string
  accountHolderType?: "Individual" | "Business"
}

/** Split full name into Noah Individual Name shape. */
export function buildAccountHolderName(input: AccountHolderNameInput): Record<string, unknown> {
  const type = input.accountHolderType ?? "Individual"
  const raw = String(input.fullName || "").trim()
  if (type === "Business") {
    return { AccountHolderType: "Business", Name: raw.slice(0, 50) }
  }
  const parts = raw.split(/\s+/).filter(Boolean)
  const firstName = parts[0] ?? raw
  const lastName = parts.length > 1 ? parts.slice(1).join(" ") : firstName
  return {
    AccountHolderType: "Individual",
    Name: { FirstName: firstName.slice(0, 32), LastName: lastName.slice(0, 32) },
  }
}

export function buildAccountHolderAddress(input: {
  address: string
  city: string
  state: string
  postalCode: string
}): Record<string, unknown> {
  return {
    Address: input.address.trim(),
    City: input.city.trim(),
    State: input.state.trim(),
    PostalCode: input.postalCode.trim(),
  }
}

function defaultPaymentPurpose() {
  return "personal transfer"
}

/** Strip spaces/separators so Noah bank rails get digits-only account numbers (e.g. NGN). */
export function normalizeBankAccountNumber(accountNumber: string): string {
  return String(accountNumber || "")
    .trim()
    .replace(/\s/g, "")
    .replace(/[^\d]/g, "")
}

/** ISO2 → ITU calling code (Noah payout corridors that require PhoneNumber / mobile). */
const ISO2_CALLING_CODE: Record<string, string> = {
  BJ: "229",
  BF: "226",
  BW: "267",
  CM: "237",
  CI: "225",
  GH: "233",
  IN: "91",
  ID: "62",
  KE: "254",
  MW: "265",
  ML: "223",
  NG: "234",
  PH: "63",
  RW: "250",
  SN: "221",
  TG: "228",
  TZ: "255",
  UG: "256",
  ZA: "27",
  ZM: "260",
}

/**
 * Noah sell/prepare expects E.164 with a leading '+' (e.g. ZA local 082… → +2782…).
 */
export function normalizeNoahE164Phone(phone: string, countryCode?: string): string {
  const trimmed = String(phone || "").trim()
  if (!trimmed) return ""

  if (trimmed.startsWith("+")) {
    const digits = trimmed.slice(1).replace(/\D/g, "")
    return digits ? `+${digits}` : ""
  }

  let digits = trimmed.replace(/[\s().-]/g, "").replace(/\D/g, "")
  if (!digits) return ""

  if (digits.startsWith("00")) {
    digits = digits.slice(2)
    return digits ? `+${digits}` : ""
  }

  const iso2 = String(countryCode || "").trim().toUpperCase()
  const calling = iso2 ? ISO2_CALLING_CODE[iso2] : undefined
  if (calling) {
    if (digits.startsWith(calling) && digits.length >= calling.length + 7) {
      return `+${digits}`
    }
    if (digits.startsWith("0") && digits.length >= 9) {
      return `+${calling}${digits.slice(1)}`
    }
    if (digits.length >= 7 && digits.length <= 12) {
      return `+${calling}${digits}`
    }
  }

  return `+${digits}`
}

export function buildEurSepaSellForm(input: {
  iban: string
  fullName: string
  reference: string
  paymentPurpose?: string
}): Record<string, unknown> {
  const form: Record<string, unknown> = {
    BankDetails: { AccountNumber: input.iban.replace(/\s/g, "") },
    AccountHolderName: buildAccountHolderName({ fullName: input.fullName }),
    Reference: input.reference.trim(),
  }
  const purpose = input.paymentPurpose?.trim()
  if (purpose) form.PaymentPurpose = purpose
  return form
}

export type UsBankRecipientFormInput = {
  accountHolderAddress: { address: string; city: string; state: string; postalCode: string }
  accountNumber: string
  routingNumber: string
  fullName: string
  accountType?: "Checking" | "Savings"
  paymentPurpose?: string
  reference?: string
  achRail?: boolean
}

export function buildUsBankSellForm(recipient: UsBankRecipientFormInput): Record<string, unknown> {
  const purpose = recipient.paymentPurpose?.trim() || defaultPaymentPurpose()
  const achRail = recipient.achRail !== false
  const details: Record<string, unknown> = {
    AccountNumber: normalizeBankAccountNumber(recipient.accountNumber),
    BankCode: normalizeBankAccountNumber(recipient.routingNumber),
  }
  if (achRail && recipient.accountType) {
    details.AccountType = recipient.accountType
  }
  const form: Record<string, unknown> = {
    AccountHolderName: buildAccountHolderName({ fullName: recipient.fullName }),
    AccountHolderAddress: buildAccountHolderAddress(recipient.accountHolderAddress),
    BankDetails: details,
    PaymentPurpose: purpose,
  }
  const ref = recipient.reference?.trim()
  if (ref) form.Reference = ref
  return form
}

export function buildCaBankLocalSellForm(input: {
  accountNumber: string
  routingNumber: string
  branchCode: string
  bankName: string
  fullName: string
  address: { address: string; city: string; state: string; postalCode: string }
  paymentPurpose: string
}): Record<string, unknown> {
  return {
    BankDetails: {
      AccountNumber: normalizeBankAccountNumber(input.accountNumber),
      BankCode: normalizeBankAccountNumber(input.routingNumber),
      BranchCode: normalizeBankAccountNumber(input.branchCode),
      BankName: input.bankName.trim(),
    },
    AccountHolderName: buildAccountHolderName({ fullName: input.fullName }),
    AccountHolderAddress: buildAccountHolderAddress(input.address),
    PaymentPurpose: input.paymentPurpose.trim(),
  }
}

export function buildGbBankLocalSellForm(input: {
  accountNumber: string
  sortCode: string
  bankName: string
  fullName: string
  paymentPurpose?: string
}): Record<string, unknown> {
  return {
    BankDetails: {
      AccountNumber: normalizeBankAccountNumber(input.accountNumber),
      SortCode: input.sortCode.replace(/\D/g, ""),
      BankName: input.bankName.trim(),
    },
    AccountHolderName: buildAccountHolderName({ fullName: input.fullName }),
    PaymentPurpose: input.paymentPurpose?.trim() || defaultPaymentPurpose(),
  }
}

/** BankLocal with BankName + BankCode SWIFT (ID). */
export function buildIdBankLocalSellForm(input: {
  accountNumber: string
  bankName: string
  swiftBic: string
  fullName: string
  phone: string
  paymentPurpose: string
}): Record<string, unknown> {
  return {
    BankDetails: {
      AccountNumber: normalizeBankAccountNumber(input.accountNumber),
      BankName: input.bankName.trim(),
      BankCode: input.swiftBic.trim().toUpperCase(),
    },
    AccountHolderName: buildAccountHolderName({ fullName: input.fullName }),
    PhoneNumber: normalizeNoahE164Phone(input.phone, "ID"),
    PaymentPurpose: input.paymentPurpose.trim(),
  }
}

export type BankLocalSellInput = {
  accountNumber: string
  bankName: string
  fullName: string
  countryCode?: string
  phone?: string
  email?: string
  address?: { address: string; city: string; state: string; postalCode: string }
  paymentPurpose?: string
  reference?: string
}

/** BankLocal with `Bank` enum (NG, KE, GH, ZA). */
export function buildBankLocalSellForm(
  formSchema: Record<string, unknown> | undefined,
  data: BankLocalSellInput,
): Record<string, unknown> {
  const purpose = data.paymentPurpose?.trim() || defaultPaymentPurpose()
  const form: Record<string, unknown> = {
    BankDetails: {
      AccountNumber: normalizeBankAccountNumber(data.accountNumber),
      Bank: data.bankName.trim(),
    },
    PaymentPurpose: purpose,
  }
  if (data.fullName.trim()) {
    form.AccountHolderName = buildAccountHolderName({ fullName: data.fullName })
  }
  if (data.phone?.trim() && (isRequired(formSchema, "PhoneNumber") || prop(formSchema, "PhoneNumber"))) {
    form.PhoneNumber = normalizeNoahE164Phone(data.phone, data.countryCode)
  }
  if (data.email?.trim() && (isRequired(formSchema, "Email") || prop(formSchema, "Email"))) {
    form.Email = data.email.trim()
  }
  if (
    data.address &&
    (isRequired(formSchema, "AccountHolderAddress") || prop(formSchema, "AccountHolderAddress"))
  ) {
    form.AccountHolderAddress = buildAccountHolderAddress(data.address)
  }
  const ref = data.reference?.trim()
  if (ref && (isRequired(formSchema, "Reference") || prop(formSchema, "Reference"))) {
    form.Reference = ref
  }
  return form
}

export type IdentifierSellInput = {
  phone: string
  fullName: string
  countryCode?: string
  paymentPurpose?: string
}

function isRequired(schema: Record<string, unknown> | undefined, key: string): boolean {
  const req = schema?.required
  return Array.isArray(req) && req.includes(key)
}

function prop(schema: Record<string, unknown> | undefined, key: string): unknown {
  if (!schema?.properties || typeof schema.properties !== "object") return undefined
  return (schema.properties as Record<string, unknown>)[key]
}

/** Identifier / mobile money — nested MobileMoneyDetails when schema requires it. */
export function buildIdentifierSellForm(
  formSchema: Record<string, unknown> | undefined,
  data: IdentifierSellInput,
): Record<string, unknown> {
  const purpose = data.paymentPurpose?.trim() || defaultPaymentPurpose()
  const phone = normalizeNoahE164Phone(data.phone, data.countryCode)
  const holder = buildAccountHolderName({ fullName: data.fullName })

  const mmDetails = prop(formSchema, "MobileMoneyDetails")
  if (mmDetails && typeof mmDetails === "object") {
    const form: Record<string, unknown> = {
      MobileMoneyDetails: { MobileNumber: phone },
      PaymentPurpose: purpose,
    }
    if (isRequired(formSchema, "AccountHolderName") || prop(formSchema, "AccountHolderName")) {
      form.AccountHolderName = holder
    }
    return form
  }

  if (!formSchema?.properties || typeof formSchema.properties !== "object") {
    return { FullName: data.fullName, PhoneNumber: phone, PaymentPurpose: purpose }
  }

  const out: Record<string, unknown> = {}
  const required = (formSchema.required as string[] | undefined) ?? Object.keys(
    formSchema.properties as object,
  )
  const p = formSchema.properties as Record<string, { title?: string }>
  for (const key of required) {
    const low = key.toLowerCase()
    const title = String(p[key]?.title ?? "").toLowerCase()
    const blob = `${low} ${title}`
    if (/phone|msisdn|mobile|e164|subscriber/i.test(blob)) out[key] = phone
    else if (/name|holder|beneficiary|recipient/i.test(blob)) out[key] = data.fullName
    else if (/purpose/i.test(blob)) out[key] = purpose
  }
  if (Object.keys(out).length === 0) {
    return { FullName: data.fullName, PhoneNumber: phone, PaymentPurpose: purpose }
  }
  if (!out.PaymentPurpose) out.PaymentPurpose = purpose
  return out
}

export function isNoahUsAchChannel(paymentMethodType: string): boolean {
  const t = String(paymentMethodType || "").toLowerCase()
  return t.includes("ach") && !t.includes("fedwire")
}

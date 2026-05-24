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
    AccountNumber: recipient.accountNumber.trim(),
    BankCode: recipient.routingNumber.trim(),
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
      AccountNumber: input.accountNumber.trim(),
      BankCode: input.routingNumber.trim(),
      BranchCode: input.branchCode.trim(),
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
      AccountNumber: input.accountNumber.trim(),
      SortCode: input.sortCode.replace(/\D/g, ""),
      BankName: input.bankName.trim(),
    },
    AccountHolderName: buildAccountHolderName({ fullName: input.fullName }),
    PaymentPurpose: input.paymentPurpose?.trim() || defaultPaymentPurpose(),
  }
}

export type BankLocalSellInput = {
  accountNumber: string
  bankName: string
  fullName: string
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
      AccountNumber: data.accountNumber.trim(),
      Bank: data.bankName.trim(),
    },
    PaymentPurpose: purpose,
  }
  if (data.fullName.trim()) {
    form.AccountHolderName = buildAccountHolderName({ fullName: data.fullName })
  }
  if (data.phone?.trim() && (isRequired(formSchema, "PhoneNumber") || prop(formSchema, "PhoneNumber"))) {
    form.PhoneNumber = data.phone.trim()
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
  const phone = data.phone.trim()
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

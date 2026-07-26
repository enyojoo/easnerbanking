import type {
  PayrollExternalReceivingMethodInput,
  PayrollRail,
} from "@/lib/payroll/types"

export type NormalizedPayrollReceivingMethod = {
  type: "bank" | "mobile_money" | "stablecoin"
  rail: Extract<PayrollRail, "bank" | "mobile" | "crypto">
  label: string
  details: Record<string, string>
}

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : ""
}

function compact(values: Record<string, unknown>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(values)
      .map(([key, value]) => [key, clean(value)])
      .filter(([, value]) => Boolean(value)),
  )
}

export function normalizePayrollReceivingMethodInput(
  input: PayrollExternalReceivingMethodInput,
  fallbackName: string,
): NormalizedPayrollReceivingMethod {
  const fullName = clean(input.fullName) || clean(fallbackName)
  const currency = clean(input.currency).toUpperCase()
  if (!fullName || !currency) throw new Error("Receiving method name and currency are required.")

  if (input.type === "bank") {
    const bankName = clean(input.bankName)
    const accountNumber = clean(input.accountNumber)
    const countryCode = clean(input.countryCode).toUpperCase()
    if (!bankName || !accountNumber || !countryCode) {
      throw new Error("Complete the bank account details.")
    }
    return {
      type: "bank",
      rail: "bank",
      label: bankName,
      details: compact({
        fullName,
        countryCode,
        currency,
        bankName,
        accountNumber,
        routingNumber: input.routingNumber,
        sortCode: input.sortCode,
        iban: input.iban,
        swiftBic: input.swiftBic,
        transferType: input.transferType,
        accountType: input.checkingOrSavings,
        phoneNumber: input.phoneNumber,
        email: input.email,
        addressLine1: input.addressLine1,
        city: input.city,
        state: input.state,
        postalCode: input.postalCode,
      }),
    }
  }

  if (input.type === "mobile_money") {
    const provider = clean(input.provider)
    const phoneNumber = clean(input.phoneNumber)
    const countryCode = clean(input.countryCode).toUpperCase()
    if (!provider || !phoneNumber || !countryCode) {
      throw new Error("Complete the mobile-money details.")
    }
    return {
      type: "mobile_money",
      rail: "mobile",
      label: provider,
      details: compact({
        fullName,
        countryCode,
        currency,
        provider,
        phoneNumber,
        email: input.email,
      }),
    }
  }

  const asset = clean(input.asset || input.currency).toUpperCase()
  const network = clean(input.network)
  const walletAddress = clean(input.walletAddress)
  if (!asset || !network || !walletAddress) {
    throw new Error("Complete the wallet details.")
  }
  return {
    type: "stablecoin",
    rail: "crypto",
    label: `${asset} on ${network}`,
    details: compact({
      fullName,
      countryCode: input.countryCode,
      currency: asset,
      asset,
      network,
      walletAddress,
      email: input.email,
    }),
  }
}

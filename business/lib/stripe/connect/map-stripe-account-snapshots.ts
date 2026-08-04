import type Stripe from "stripe"

export type ConnectRequirementsSnapshot = {
  currently_due: string[]
  eventually_due: string[]
  past_due: string[]
  pending_verification: string[]
  errors: Array<{ code: string; reason: string; requirement: string }>
  disabled_reason: string | null
  current_deadline: number | null
}

export type ConnectBusinessProfileSnapshot = {
  name: string | null
  url: string | null
  support_email: string | null
  support_phone: string | null
  mcc: string | null
  country: string | null
}

export type ConnectPayoutDestinationSnapshot = {
  stripeExternalAccountId: string
  currency: string
  last4: string | null
  bankName: string | null
  defaultForCurrency: boolean
  status: string | null
}

export function mapRequirementsSnapshot(
  requirements: Stripe.Account.Requirements | null | undefined,
): ConnectRequirementsSnapshot {
  return {
    currently_due: [...(requirements?.currently_due ?? [])],
    eventually_due: [...(requirements?.eventually_due ?? [])],
    past_due: [...(requirements?.past_due ?? [])],
    pending_verification: [...(requirements?.pending_verification ?? [])],
    errors: (requirements?.errors ?? []).map((error) => ({
      code: String(error.code ?? ""),
      reason: String(error.reason ?? ""),
      requirement: String(error.requirement ?? ""),
    })),
    disabled_reason: requirements?.disabled_reason ?? null,
    current_deadline:
      typeof requirements?.current_deadline === "number" ? requirements.current_deadline : null,
  }
}

export function mapCapabilitiesSnapshot(
  capabilities: Stripe.Account.Capabilities | null | undefined,
): Record<string, string> {
  if (!capabilities) return {}
  return Object.fromEntries(
    Object.entries(capabilities).map(([key, value]) => [key, String(value ?? "inactive")]),
  )
}

export function mapBusinessProfileSnapshot(account: Stripe.Account): ConnectBusinessProfileSnapshot {
  const profile = account.business_profile
  const company = account.company
  return {
    name: profile?.name ?? company?.name ?? null,
    url: profile?.url ?? null,
    support_email: profile?.support_email ?? null,
    support_phone: profile?.support_phone ?? null,
    mcc: profile?.mcc ?? null,
    country: account.country ?? company?.address?.country ?? null,
  }
}

export function mapPayoutDestinationSnapshot(
  bank: Stripe.BankAccount | null | undefined,
): ConnectPayoutDestinationSnapshot | null {
  if (!bank?.id) return null
  return {
    stripeExternalAccountId: bank.id,
    currency: String(bank.currency ?? "").toUpperCase(),
    last4: bank.last4 ?? null,
    bankName: bank.bank_name ?? null,
    defaultForCurrency: Boolean(bank.default_for_currency),
    status: bank.status ?? null,
  }
}

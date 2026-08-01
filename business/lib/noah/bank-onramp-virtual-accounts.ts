import type { SupabaseClient } from "@supabase/supabase-js"
import { resolveBusinessOrgOwnerUserId } from "@/lib/business/org-owner"
import { startBankDepositToOnchainAddress } from "@/lib/noah/bank-onramp-workflow"
import { getNoahEurCryptoTicker, getNoahUsdCryptoTicker } from "@/lib/noah/config"
import { fetchAllPaymentMethodsForCustomer } from "@/lib/noah/list-payment-methods"
import {
  selectPreferredEurPayinPaymentMethod,
  selectPreferredUsdPayinPaymentMethod,
} from "@/lib/noah/payment-method-map"
import {
  persistAllPayinVirtualAccountsFromPaymentMethods,
  persistVirtualAccountFromBankOnrampWorkflow,
} from "@/lib/noah/persist-account-data"
import type { NoahAccountContext } from "@/lib/noah/resolve-account-context"
import { resolveBankOnrampDestinationAddress } from "@/lib/deposit-omnibus/resolve-va-destination"
import { hasActiveVirtualAccountInDb } from "@/lib/noah/virtual-accounts-db"

const NOAH_BANK_ONRAMP_NETWORK = "Solana"

type FiatRail = "usd" | "eur"

type RailConfig = {
  fiat: FiatRail
  fiatCurrency: "USD" | "EUR"
  cryptoCurrency: string
  ledgerCurrency: "USD" | "EUR"
  column: "noah_usd_virtual_account_id" | "noah_eur_virtual_account_id"
}

const FIAT_RAILS: RailConfig[] = [
  {
    fiat: "usd",
    fiatCurrency: "USD",
    cryptoCurrency: getNoahUsdCryptoTicker(),
    ledgerCurrency: "USD",
    column: "noah_usd_virtual_account_id",
  },
  {
    fiat: "eur",
    fiatCurrency: "EUR",
    cryptoCurrency: getNoahEurCryptoTicker(),
    ledgerCurrency: "EUR",
    column: "noah_eur_virtual_account_id",
  },
]

export type BankOnrampVirtualAccountSummary = {
  usdBankOnrampAttempted: boolean
  eurBankOnrampAttempted: boolean
  usdBankOnrampCreated: boolean
  eurBankOnrampCreated: boolean
}

function buildAccountContext(opts: {
  scope: "individual" | "business"
  subjectUserId: string
  subjectBusinessId: string | null
  noahCustomerId: string
}): NoahAccountContext {
  return {
    scope: opts.scope,
    subjectUserId: opts.subjectUserId,
    subjectBusinessId: opts.subjectBusinessId,
    noahCustomerId: opts.noahCustomerId,
    customerType: opts.scope === "business" ? "Business" : "Individual",
  }
}

async function subjectHasFiatVirtualAccount(
  admin: SupabaseClient,
  opts: {
    subjectUserId: string
    subjectBusinessId: string | null
    rail: FiatRail
    column: RailConfig["column"]
  },
): Promise<boolean> {
  if (opts.subjectBusinessId) {
    return hasActiveVirtualAccountInDb(admin, {
      currency: opts.rail,
      userId: opts.subjectUserId,
      businessId: opts.subjectBusinessId,
    })
  }
  const { data } = await admin
    .from("users")
    .select(opts.column)
    .eq("id", opts.subjectUserId)
    .maybeSingle()
  const id = (data as Record<string, string | null> | null)?.[opts.column]
  return Boolean(id?.trim())
}

function hasPreferredPayinForRail(
  rail: RailConfig,
  paymentMethods: Record<string, unknown>[],
): boolean {
  return rail.fiat === "usd"
    ? Boolean(selectPreferredUsdPayinPaymentMethod(paymentMethods))
    : Boolean(selectPreferredEurPayinPaymentMethod(paymentMethods))
}

async function ensureSingleFiatRailViaBankOnramp(
  admin: SupabaseClient,
  opts: {
    scope: "individual" | "business"
    subjectUserId: string
    subjectBusinessId: string | null
    noahCustomerId: string
  },
  rail: RailConfig,
  alreadyHasPaymentMethod: boolean,
): Promise<{ attempted: boolean; created: boolean }> {
  if (alreadyHasPaymentMethod) {
    return { attempted: false, created: true }
  }

  const mirrored = await subjectHasFiatVirtualAccount(admin, {
    subjectUserId: opts.subjectUserId,
    subjectBusinessId: opts.subjectBusinessId,
    rail: rail.fiat,
    column: rail.column,
  })
  if (mirrored) {
    return { attempted: false, created: true }
  }

  const ctx = buildAccountContext(opts)
  const destination = await resolveBankOnrampDestinationAddress(
    admin,
    ctx,
    rail.cryptoCurrency,
    NOAH_BANK_ONRAMP_NETWORK,
  )
  if (!destination) {
    console.warn("[ensureFiatVirtualAccountsViaBankOnramp] no Turnkey destination", {
      noahCustomerId: opts.noahCustomerId,
      fiat: rail.fiatCurrency,
      crypto: rail.cryptoCurrency,
    })
    return { attempted: false, created: false }
  }

  try {
    const workflow = await startBankDepositToOnchainAddress({
      customerId: opts.noahCustomerId,
      fiatCurrency: rail.fiatCurrency,
      cryptoCurrency: rail.cryptoCurrency,
      network: NOAH_BANK_ONRAMP_NETWORK,
      destinationAddress: destination,
    })
    await persistVirtualAccountFromBankOnrampWorkflow(
      opts.subjectUserId,
      rail.fiat,
      workflow,
      opts.subjectBusinessId,
      opts.noahCustomerId,
    )
    const paymentMethods = await fetchAllPaymentMethodsForCustomer(opts.noahCustomerId)
    await persistAllPayinVirtualAccountsFromPaymentMethods(
      opts.subjectUserId,
      paymentMethods,
      opts.subjectBusinessId,
      opts.noahCustomerId,
    )
    return { attempted: true, created: hasPreferredPayinForRail(rail, paymentMethods) || true }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.warn("[ensureFiatVirtualAccountsViaBankOnramp] workflow failed", {
      noahCustomerId: opts.noahCustomerId,
      fiat: rail.fiatCurrency,
      error: msg.slice(0, 200),
    })

    const paymentMethods = await fetchAllPaymentMethodsForCustomer(opts.noahCustomerId)
    await persistAllPayinVirtualAccountsFromPaymentMethods(
      opts.subjectUserId,
      paymentMethods,
      opts.subjectBusinessId,
      opts.noahCustomerId,
    )
    return { attempted: true, created: hasPreferredPayinForRail(rail, paymentMethods) }
  }
}

/**
 * Assign Noah fiat virtual accounts via `POST /workflows/bank-deposit-to-onchain-address`
 * when listing payment methods returns none (Noah bank onramp recipe).
 */
export async function ensureFiatVirtualAccountsViaBankOnramp(
  admin: SupabaseClient,
  opts: {
    scope: "individual" | "business"
    subjectUserId: string
    subjectBusinessId: string | null
    noahCustomerId: string
    hasUsdPaymentMethod: boolean
    hasEurPaymentMethod: boolean
  },
): Promise<BankOnrampVirtualAccountSummary> {
  const usd = await ensureSingleFiatRailViaBankOnramp(
    admin,
    opts,
    FIAT_RAILS[0]!,
    opts.hasUsdPaymentMethod,
  )
  const eur = await ensureSingleFiatRailViaBankOnramp(
    admin,
    opts,
    FIAT_RAILS[1]!,
    opts.hasEurPaymentMethod,
  )

  return {
    usdBankOnrampAttempted: usd.attempted,
    eurBankOnrampAttempted: eur.attempted,
    usdBankOnrampCreated: usd.created,
    eurBankOnrampCreated: eur.created,
  }
}

export type ReprovisionBankOnrampRailResult = {
  rail: FiatRail
  destinationAddress: string | null
  attempted: boolean
  ok: boolean
  paymentMethodId: string | null
  error: string | null
}

/**
 * Force Noah `bank-deposit-to-onchain-address` for one rail — even when a VA already exists.
 * Use when migrating destination (e.g. user vault → deposit omnibus) for approved customers.
 */
export async function reprovisionBankOnrampRail(
  admin: SupabaseClient,
  opts: {
    scope: "individual" | "business"
    subjectUserId: string
    subjectBusinessId: string | null
    noahCustomerId: string
    rail: FiatRail
    dryRun?: boolean
  },
): Promise<ReprovisionBankOnrampRailResult> {
  const railConfig = FIAT_RAILS.find((r) => r.fiat === opts.rail)
  if (!railConfig) {
    return {
      rail: opts.rail,
      destinationAddress: null,
      attempted: false,
      ok: false,
      paymentMethodId: null,
      error: "unknown_rail",
    }
  }

  const ctx = buildAccountContext({
    scope: opts.scope,
    subjectUserId: opts.subjectUserId,
    subjectBusinessId: opts.subjectBusinessId,
    noahCustomerId: opts.noahCustomerId,
  })

  const destination = await resolveBankOnrampDestinationAddress(
    admin,
    ctx,
    railConfig.cryptoCurrency,
    NOAH_BANK_ONRAMP_NETWORK,
  )

  if (!destination) {
    return {
      rail: opts.rail,
      destinationAddress: null,
      attempted: false,
      ok: false,
      paymentMethodId: null,
      error: "no_destination_address",
    }
  }

  if (opts.dryRun) {
    return {
      rail: opts.rail,
      destinationAddress: destination,
      attempted: false,
      ok: true,
      paymentMethodId: null,
      error: null,
    }
  }

  try {
    const workflow = await startBankDepositToOnchainAddress({
      customerId: opts.noahCustomerId,
      fiatCurrency: railConfig.fiatCurrency,
      cryptoCurrency: railConfig.cryptoCurrency,
      network: NOAH_BANK_ONRAMP_NETWORK,
      destinationAddress: destination,
    })
    await persistVirtualAccountFromBankOnrampWorkflow(
      opts.subjectUserId,
      opts.rail,
      workflow,
      opts.subjectBusinessId,
      opts.noahCustomerId,
    )
    const paymentMethods = await fetchAllPaymentMethodsForCustomer(opts.noahCustomerId)
    await persistAllPayinVirtualAccountsFromPaymentMethods(
      opts.subjectUserId,
      paymentMethods,
      opts.subjectBusinessId,
      opts.noahCustomerId,
    )
    const pmId = String(workflow.PaymentMethodID ?? "").trim() || null
    return {
      rail: opts.rail,
      destinationAddress: destination,
      attempted: true,
      ok: true,
      paymentMethodId: pmId,
      error: null,
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return {
      rail: opts.rail,
      destinationAddress: destination,
      attempted: true,
      ok: false,
      paymentMethodId: null,
      error: msg.slice(0, 500),
    }
  }
}

/** Re-provision USD and/or EUR bank on-ramp VAs (existing or new customers). */
export async function reprovisionBankOnrampVirtualAccounts(
  admin: SupabaseClient,
  opts: {
    scope: "individual" | "business"
    subjectUserId: string
    subjectBusinessId: string | null
    noahCustomerId: string
    rails?: FiatRail[]
    dryRun?: boolean
  },
): Promise<ReprovisionBankOnrampRailResult[]> {
  const rails = opts.rails?.length ? opts.rails : (["usd", "eur"] as FiatRail[])
  const results: ReprovisionBankOnrampRailResult[] = []
  for (const rail of rails) {
    results.push(
      await reprovisionBankOnrampRail(admin, {
        scope: opts.scope,
        subjectUserId: opts.subjectUserId,
        subjectBusinessId: opts.subjectBusinessId,
        noahCustomerId: opts.noahCustomerId,
        rail,
        dryRun: opts.dryRun,
      }),
    )
  }
  return results
}

/** After a Turnkey vault is provisioned, try bank onramp for the matching fiat rail. */
export async function ensureFiatVirtualAccountForLedgerCurrency(
  admin: SupabaseClient,
  opts: {
    ownerType: "individual" | "business"
    ownerRef: string
    noahCustomerId: string
    ledgerCurrency: string
  },
): Promise<void> {
  const ledger = opts.ledgerCurrency.trim().toUpperCase()
  const rail = FIAT_RAILS.find((r) => r.ledgerCurrency === ledger)
  if (!rail || !opts.noahCustomerId.trim()) return

  const scope = opts.ownerType === "business" ? "business" : "individual"
  const subjectBusinessId = scope === "business" ? opts.ownerRef : null
  let subjectUserId = opts.ownerRef
  if (scope === "business") {
    const ownerId = await resolveBusinessOrgOwnerUserId(admin, opts.ownerRef)
    if (ownerId) subjectUserId = ownerId
  }

  await ensureSingleFiatRailViaBankOnramp(
    admin,
    {
      scope,
      subjectUserId,
      subjectBusinessId,
      noahCustomerId: opts.noahCustomerId,
    },
    rail,
    false,
  )
}

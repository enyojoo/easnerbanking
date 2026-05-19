import type { SupabaseClient } from "@supabase/supabase-js"
import { resolveBusinessOrgOwnerUserId } from "@/lib/business/org-owner"
import { startBankDepositToOnchainAddress } from "@/lib/noah/bank-onramp-workflow"
import { getNoahEurCryptoTicker, getNoahUsdCryptoTicker } from "@/lib/noah/config"
import { fetchAllPaymentMethodsForCustomer } from "@/lib/noah/list-payment-methods"
import { hasPayinBank, matchesCurrency } from "@/lib/noah/payment-method-map"
import {
  persistVirtualAccountFromBankOnrampWorkflow,
  persistVirtualAccountFromPaymentMethod,
} from "@/lib/noah/persist-account-data"
import type { NoahAccountContext } from "@/lib/noah/resolve-account-context"
import { resolveTurnkeyAddressForNoahPair } from "@/lib/wallet/resolve-wallet-owner"

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

async function readMirroredVirtualAccountId(
  admin: SupabaseClient,
  opts: {
    subjectUserId: string
    subjectBusinessId: string | null
    column: RailConfig["column"]
  },
): Promise<string | null> {
  if (opts.subjectBusinessId) {
    const { data } = await admin
      .from("businesses")
      .select(opts.column)
      .eq("id", opts.subjectBusinessId)
      .maybeSingle()
    const id = (data as Record<string, string | null> | null)?.[opts.column]
    return id?.trim() || null
  }
  const { data } = await admin
    .from("users")
    .select(opts.column)
    .eq("id", opts.subjectUserId)
    .maybeSingle()
  const id = (data as Record<string, string | null> | null)?.[opts.column]
  return id?.trim() || null
}

async function persistPaymentMethodIfFound(
  subjectUserId: string,
  rail: RailConfig,
  paymentMethods: Record<string, unknown>[],
  subjectBusinessId: string | null,
  noahCustomerId: string,
): Promise<boolean> {
  const pm =
    rail.fiat === "usd"
      ? paymentMethods.find((p) => hasPayinBank(p, "US"))
      : paymentMethods.find((p) => {
          const caps = p.Capabilities as Record<string, unknown> | undefined
          if (caps && caps.PayinTo === false) return false
          return matchesCurrency(p, "eur")
        })
  if (!pm) return false
  await persistVirtualAccountFromPaymentMethod(
    subjectUserId,
    rail.fiat,
    pm,
    subjectBusinessId,
    noahCustomerId,
  )
  return true
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

  const mirrored = await readMirroredVirtualAccountId(admin, {
    subjectUserId: opts.subjectUserId,
    subjectBusinessId: opts.subjectBusinessId,
    column: rail.column,
  })
  if (mirrored) {
    return { attempted: false, created: true }
  }

  const ctx = buildAccountContext(opts)
  const destination = await resolveTurnkeyAddressForNoahPair(
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
    return { attempted: true, created: true }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.warn("[ensureFiatVirtualAccountsViaBankOnramp] workflow failed", {
      noahCustomerId: opts.noahCustomerId,
      fiat: rail.fiatCurrency,
      error: msg.slice(0, 200),
    })

    const paymentMethods = await fetchAllPaymentMethodsForCustomer(opts.noahCustomerId)
    const persisted = await persistPaymentMethodIfFound(
      opts.subjectUserId,
      rail,
      paymentMethods,
      opts.subjectBusinessId,
      opts.noahCustomerId,
    )
    return { attempted: true, created: persisted }
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

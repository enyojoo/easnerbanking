/**
 * Backfill Stablecoin deposits to the platform fee/org vault (J8Xh) that the
 * fee-wallet handler swallowed (processed inbox, no ledger row).
 *
 * Skips dust and matched YC cross-border refunds. Does not apply wallet delta
 * (ATA sync already moved the balance).
 *
 *   cd business && npx tsx scripts/heal-fee-wallet-skipped-deposits.ts
 *   cd business && npx tsx scripts/heal-fee-wallet-skipped-deposits.ts --apply
 */
import { createClient } from "@supabase/supabase-js"
import { parseTurnkeyBalanceWebhookPayload } from "@/lib/turnkey/turnkey-balance-webhook-payload"
import { turnkeyBalanceDepositProviderTransactionId } from "@/lib/turnkey/turnkey-balance-webhook-payload"
import { resolveTurnkeyWalletScopeFromEvent } from "@/lib/turnkey/resolve-turnkey-wallet-scope"
import { inboundHashHasVisibleLedgerCredit } from "@/lib/turnkey/inbound-hash-visible-ledger"
import { withOrganicStablecoinDepositMetadata } from "@/lib/turnkey/organic-stablecoin-deposit-metadata"
import { generateTransactionId } from "@/lib/transaction-id"
import { buildWalletReportingSnapshot } from "@/lib/transactions/reporting-snapshot"
import { isGridVaTurnkeyDustAmount } from "@/lib/grid/grid-va-turnkey-dust"
import { findYcCrossBorderFeeWalletRefundSuppression } from "@/lib/yellowcard/yc-ledger"
import { resolveWalletSendFeeSolanaAddress } from "@/lib/wallet-send/fee-address"
import { isActiveSolanaWalletAddress } from "@/lib/turnkey/resolve-turnkey-wallet-scope"
import { createSolanaRpcConnection } from "@/lib/solana/rpc-connection"
import { mintForStablecoinAsset } from "@/lib/solana/spl-mints"
import { resolveSolanaInboundSenderFromTxHash } from "@/lib/turnkey/solana-inbound-sender"

const APPLY = process.argv.includes("--apply")
const EASNER_GROUP_VAULT = "J8Xh2H1WLd252soocN2r3R3CbgadA5Rq9LBMvXkUyDVA"
const FEE_USD = resolveWalletSendFeeSolanaAddress({ ledgerCurrency: "USD" })
const FEE_EUR = resolveWalletSendFeeSolanaAddress({ ledgerCurrency: "EUR" })

function isHealVault(address: string): boolean {
  return address === EASNER_GROUP_VAULT || address === FEE_USD || Boolean(FEE_EUR && address === FEE_EUR)
}

async function main() {
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  })

  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
  const { data: inbox, error } = await admin
    .from("event_inbox")
    .select("event_id,payload,status")
    .eq("provider", "turnkey")
    .gte("received_at", since)
    .order("received_at", { ascending: false })
    .limit(1000)
  if (error) throw error

  const seenHash = new Set<string>()
  let missing = 0
  let inserted = 0
  let skipped = 0

  for (const row of inbox ?? []) {
    const parsed = parseTurnkeyBalanceWebhookPayload(row.payload)
    if (parsed.kind !== "deposit") continue
    const deposit = parsed.data
    if (!isHealVault(deposit.address)) continue
    if (isGridVaTurnkeyDustAmount(deposit.amount) || deposit.amount <= 0) {
      skipped += 1
      continue
    }
    if (seenHash.has(deposit.txHash)) continue
    seenHash.add(deposit.txHash)

    let sender = String(deposit.counterpartyAddress || "").trim() || null
    if (!sender && deposit.txHash) {
      const mint = mintForStablecoinAsset(deposit.asset === "EURC" ? "EURC" : "USDC")
      if (mint) {
        sender = await resolveSolanaInboundSenderFromTxHash(createSolanaRpcConnection(), {
          txHash: deposit.txHash,
          mint,
          ownerAddress: deposit.address,
        }).catch(() => null)
      }
    }
    const fromManagedVault = sender ? await isActiveSolanaWalletAddress(admin, sender) : false
    if (!fromManagedVault) {
      const yc = await findYcCrossBorderFeeWalletRefundSuppression(admin, {
        amount: deposit.amount,
        currency: deposit.asset === "EURC" ? "EUR" : "USD",
      })
      if (yc) {
        console.log("SKIP_YC_REFUND", { txHash: deposit.txHash, amount: deposit.amount })
        skipped += 1
        continue
      }
    }

    const scope = await resolveTurnkeyWalletScopeFromEvent(admin, {
      ...deposit.raw,
      address: deposit.address,
      txHash: deposit.txHash,
      asset: deposit.asset,
      msg: deposit.raw.msg as Record<string, unknown>,
    })
    if (!scope) {
      console.log("SKIP_NO_SCOPE", { address: deposit.address, txHash: deposit.txHash })
      skipped += 1
      continue
    }

    const visible = await inboundHashHasVisibleLedgerCredit(admin, {
      txHash: deposit.txHash,
      userId: scope.userId,
      businessId: scope.businessId,
    })
    if (visible) {
      skipped += 1
      continue
    }

    missing += 1
    const currency = deposit.asset === "EURC" ? "EUR" : "USD"
    const addressForId = scope.tokenAccountAddress || scope.walletAddress
    const providerTransactionId = turnkeyBalanceDepositProviderTransactionId(deposit, addressForId)
    const easnerTransactionId = generateTransactionId()
    const metadata = withOrganicStablecoinDepositMetadata({
      source: "turnkey_balance_webhook",
      operation: "deposit",
      source_payment_rail: "solana",
      source_currency: deposit.asset,
      organic_deposit_fallback: true,
      fee_wallet_heal: true,
      ...(fromManagedVault ? { fee_wallet_revenue_sweep: true } : {}),
      ...(sender ? { from_address: sender } : {}),
      balance_delta_applied: true,
      easner_transaction_id: easnerTransactionId,
      ...buildWalletReportingSnapshot({ amount: deposit.amount, currency, fxRates: [] }),
    })

    console.log("MISSING", {
      txHash: deposit.txHash,
      amount: deposit.amount,
      businessId: scope.businessId,
      easnerTransactionId,
      fromManagedVault,
      sender,
    })

    if (!APPLY) continue

    const { error: insErr } = await admin.from("transactions").insert({
      user_id: scope.userId,
      business_id: scope.businessId,
      provider: "turnkey",
      provider_transaction_id: providerTransactionId,
      provider_event_id: String(row.event_id),
      status: "settled",
      amount: deposit.amount,
      currency,
      direction: "in",
      payload: deposit.raw,
      metadata,
      tx_hash: deposit.txHash,
      wallet_address: scope.walletAddress,
      asset: deposit.asset,
      chain: "solana",
      occurred_at: deposit.occurredAt,
      settled_at: deposit.settledAt ?? deposit.occurredAt,
      base_currency: currency,
      base_amount: deposit.amount,
      easner_transaction_id: easnerTransactionId,
      hidden_from_feed: false,
    })
    if (insErr) throw insErr
    inserted += 1
  }

  console.log({
    APPLY,
    feeUsd: FEE_USD,
    easnerGroupVault: EASNER_GROUP_VAULT,
    scanned: inbox?.length ?? 0,
    missing,
    inserted,
    skipped,
  })
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

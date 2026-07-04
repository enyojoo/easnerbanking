import type { SupabaseClient } from "@supabase/supabase-js"
import { applyTurnkeyInboundLedgerEvent } from "@/lib/turnkey/apply-turnkey-inbound-ledger"
import { isTurnkeyBalanceWebhooksIngestEnabled } from "@/lib/turnkey/config"
import { turnkeyInboundLedgerRowExists } from "@/lib/turnkey/ledger-inbound-exists"
import type { NormalizedTurnkeyBalanceDeposit } from "@/lib/turnkey/turnkey-balance-webhook-payload"
import { turnkeyBalanceDepositProviderTransactionId } from "@/lib/turnkey/turnkey-balance-webhook-payload"
import { resolveTurnkeyWalletScopeFromEvent } from "@/lib/turnkey/resolve-turnkey-wallet-scope"
import { isDepositOmnibusAddress } from "@/lib/deposit-omnibus/config"
import { handleDepositOmnibusInbound } from "@/lib/deposit-omnibus/handle-omnibus-inbound"

function mapAssetToCurrency(asset: string): string {
  const a = asset.trim().toUpperCase()
  if (a === "EURC") return "EUR"
  return "USD"
}

/**
 * Ingest Turnkey balance deposit webhooks (`balances:confirmed` / `balances:finalized`)
 * as organic Stablecoin Deposit rows. Confirmed and finalized for the same tx dedupe
 * via tx-hash `provider_transaction_id` and `turnkeyInboundLedgerRowExists`.
 */
export async function applyTurnkeyBalanceWebhookSideEffects(
  admin: SupabaseClient,
  deposit: NormalizedTurnkeyBalanceDeposit,
  eventId: string,
): Promise<boolean> {
  if (!isTurnkeyBalanceWebhooksIngestEnabled()) return false

  if (isDepositOmnibusAddress(deposit.address)) {
    return handleDepositOmnibusInbound(admin, deposit, eventId)
  }

  const scope = await resolveTurnkeyWalletScopeFromEvent(admin, {
    ...deposit.raw,
    address: deposit.address,
    txHash: deposit.txHash,
    asset: deposit.asset,
    msg: {
      address: deposit.address,
      txHash: deposit.txHash,
      operation: "deposit",
      asset: { symbol: deposit.asset, amount: deposit.amountMinor ?? deposit.amount, decimals: deposit.decimals },
    },
  })
  if (!scope) return false

  const asset = String(scope.walletAccount.asset || deposit.asset).toUpperCase()
  const chain = String(scope.walletAccount.chain || "solana").toLowerCase()
  const currency = mapAssetToCurrency(asset)

  const addressForId = scope.tokenAccountAddress || scope.walletAddress
  if (
    deposit.txHash &&
    (await turnkeyInboundLedgerRowExists(admin, {
      signature: deposit.txHash,
      userId: scope.userId,
      businessId: scope.businessId,
    }))
  ) {
    return true
  }

  const providerTransactionId = turnkeyBalanceDepositProviderTransactionId(deposit, addressForId)

  const result = await applyTurnkeyInboundLedgerEvent(admin, {
    userId: scope.userId,
    businessId: scope.businessId,
    walletAccount: {
      id: String(scope.walletAccount.id),
      address: scope.walletAddress,
      asset,
      chain,
      associated_token_account_address: scope.tokenAccountAddress || null,
    },
    providerTransactionId,
    providerEventId: eventId,
    status: "settled",
    amount: deposit.amount,
    currency,
    direction: "in",
    payload: deposit.raw,
    metadata: { source: "turnkey_balance_webhook", operation: "deposit" },
    txHash: deposit.txHash,
    walletAddress: scope.walletAddress,
    counterpartyAddress: deposit.counterpartyAddress,
    occurredAt: deposit.occurredAt,
    settledAt: deposit.settledAt,
    asset,
    chain,
    amountMinor: deposit.amountMinor,
  })

  return (
    result.kind === "applied" ||
    result.kind === "skipped" ||
    result.kind === "suppressed_noah" ||
    result.kind === "suppressed_easetag"
  )
}

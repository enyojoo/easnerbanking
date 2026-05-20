import type { SupabaseClient } from "@supabase/supabase-js"
import { applyTurnkeyInboundLedgerEvent } from "@/lib/turnkey/apply-turnkey-inbound-ledger"
import { isTurnkeyBalanceWebhooksIngestEnabled } from "@/lib/turnkey/config"
import type { NormalizedTurnkeyBalanceDeposit } from "@/lib/turnkey/turnkey-balance-webhook-payload"
import { resolveTurnkeyWalletScopeFromEvent } from "@/lib/turnkey/resolve-turnkey-wallet-scope"

function mapAssetToCurrency(asset: string): string {
  const a = asset.trim().toUpperCase()
  if (a === "EURC") return "EUR"
  return "USD"
}

/**
 * Ingest Turnkey `balances:confirmed` deposits as organic Stablecoin Deposit rows.
 */
export async function applyTurnkeyBalanceWebhookSideEffects(
  admin: SupabaseClient,
  deposit: NormalizedTurnkeyBalanceDeposit,
  eventId: string,
): Promise<boolean> {
  if (!isTurnkeyBalanceWebhooksIngestEnabled()) return false

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
  const providerTransactionId = deposit.eventId || `${deposit.txHash}:${addressForId}:${asset}`

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

  return result.kind === "applied" || result.kind === "suppressed_noah" || result.kind === "suppressed_easetag"
}

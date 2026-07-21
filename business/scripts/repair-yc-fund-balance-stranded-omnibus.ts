/**
 * Repair stranded YC fund_balance USDC: omnibus → user vault without re-crediting ledger.
 *
 * Usage:
 *   cd business && node --env-file=.env.local --import tsx scripts/repair-yc-fund-balance-stranded-omnibus.ts ETID25261407
 *   cd business && node --env-file=.env.local --import tsx scripts/repair-yc-fund-balance-stranded-omnibus.ts ETID25261407 --dry-run
 */
import { Connection, PublicKey } from "@solana/web3.js"
import { createClient } from "@supabase/supabase-js"
import { mintForStablecoinAsset } from "../lib/solana/spl-mints"
import { getTurnkeyApiClient } from "../lib/turnkey/client"
import {
  getTurnkeyOrganizationId,
  getTurnkeySolanaBroadcastCaip2,
  isTurnkeySolSponsorshipEnabled,
} from "../lib/turnkey/config"
import {
  interpretTurnkeyGetSendTransactionStatus,
  pollUntilTurnkeySendTerminal,
  resolveSolSendParsedIds,
} from "../lib/turnkey/sol-send-polling"
import {
  buildStablecoinSplTransferUnsignedTxPayloadForTurnkey,
  getSolanaRpcUrl,
} from "../lib/turnkey/sol-spl-transfer-unsigned-tx"
import { isDepositSplitDryRun, resolveDepositOmnibusAddressForLedgerCurrency } from "../lib/deposit-omnibus/config"

function asMeta(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {}
}

async function resolveUserVault(
  admin: ReturnType<typeof createClient>,
  userId: string,
  businessId: string | null,
): Promise<string | null> {
  const ownerType = businessId ? "business" : "individual"
  const ownerRef = businessId ?? userId
  const { data: owner } = await admin
    .from("wallet_owners")
    .select("id")
    .eq("owner_type", ownerType)
    .eq("owner_ref", ownerRef)
    .maybeSingle()
  if (!owner?.id) return null
  const { data: wallet } = await admin
    .from("wallet_accounts")
    .select("address")
    .eq("wallet_owner_id", owner.id)
    .eq("ledger_currency", "USD")
    .eq("asset", "USDC")
    .eq("status", "active")
    .maybeSingle()
  const address = String(wallet?.address ?? "").trim()
  return address || null
}

async function readOmnibusUsdcBalance(): Promise<number> {
  const omnibusAddress = resolveDepositOmnibusAddressForLedgerCurrency("USD")
  if (!omnibusAddress) return 0
  const mint = mintForStablecoinAsset("USDC")
  if (!mint) return 0
  const connection = new Connection(getSolanaRpcUrl(), "confirmed")
  const accounts = await connection.getParsedTokenAccountsByOwner(new PublicKey(omnibusAddress), {
    mint: new PublicKey(mint),
  })
  let total = 0
  for (const { account } of accounts.value) {
    total += Number(account.data.parsed.info.tokenAmount.uiAmountString ?? 0)
  }
  return total
}

async function sendFromOmnibus(input: {
  destinationAddress: string
  amount: number
}): Promise<{ status: string; txHash: string | null; providerTransactionId: string | null; errorMessage: string | null }> {
  if (isDepositSplitDryRun()) {
    return {
      status: "skipped",
      txHash: null,
      providerTransactionId: `dry_run_${Date.now()}`,
      errorMessage: null,
    }
  }

  const omnibusAddress = resolveDepositOmnibusAddressForLedgerCurrency("USD")
  if (!omnibusAddress) throw new Error("omnibus_address_not_configured")

  const orgId = getTurnkeyOrganizationId()
  const client = getTurnkeyApiClient() as Record<string, (...args: unknown[]) => Promise<unknown>> | null
  if (!orgId || !client?.solSendTransaction) throw new Error("turnkey_not_configured")

  const sponsor = isTurnkeySolSponsorshipEnabled()
  const caip2 = getTurnkeySolanaBroadcastCaip2()
  const connection = new Connection(getSolanaRpcUrl(), "confirmed")
  const { blockhash } = await connection.getLatestBlockhash("finalized")

  const unsignedTransaction = await buildStablecoinSplTransferUnsignedTxPayloadForTurnkey({
    asset: "USDC",
    ownerAddress: omnibusAddress,
    destinationAddress: input.destinationAddress,
    destinationIsTokenAccount: false,
    amountHuman: input.amount,
    sponsoredFlow: sponsor,
    recentBlockhash: blockhash,
  })

  const sendRes = await client.solSendTransaction({
    organizationId: orgId,
    unsignedTransaction,
    signWith: omnibusAddress,
    caip2,
    ...(sponsor ? { sponsor: true, recentBlockhash: blockhash } : {}),
  })

  const parsed = await resolveSolSendParsedIds(client, orgId, (sendRes || {}) as Record<string, unknown>)
  let status = parsed.txHash ? "settled" : "pending"
  let txHash = parsed.txHash

  const pollId = parsed.sendStatusId ?? parsed.providerTransactionId
  if (pollId) {
    const terminal = await pollUntilTurnkeySendTerminal(client, orgId, pollId, {
      timeoutMs: 120_000,
      intervalMs: 2_000,
    })
    if (terminal) {
      const interpreted = interpretTurnkeyGetSendTransactionStatus(terminal)
      status = interpreted.status
      txHash = interpreted.txHash ?? txHash
    }
  }

  return {
    status,
    txHash,
    providerTransactionId: parsed.providerTransactionId,
    errorMessage: status === "failed" ? "turnkey_send_failed" : null,
  }
}

async function main() {
  const etid = process.argv.find((a) => a.startsWith("ETID"))?.trim()
  const dryRun = process.argv.includes("--dry-run")
  if (!etid) throw new Error("usage: repair-yc-fund-balance-stranded-omnibus.ts ETID... [--dry-run]")

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error("supabase_not_configured")

  const admin = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data: tx, error: txErr } = await admin
    .from("transactions")
    .select("id, user_id, business_id, amount, status, tx_hash, metadata, easner_transaction_id")
    .eq("easner_transaction_id", etid)
    .maybeSingle()
  if (txErr) throw txErr
  if (!tx?.id) throw new Error(`transaction_not_found:${etid}`)

  const txMeta = asMeta(tx.metadata)
  if (txMeta.balance_delta_applied !== true) {
    throw new Error("expected_balance_delta_applied — use normal fund balance split flow")
  }

  const { data: transfer, error: trErr } = await admin
    .from("yc_transfers")
    .select("*")
    .eq("transaction_id", tx.id)
    .eq("mode", "fund_balance")
    .maybeSingle()
  if (trErr) throw trErr
  if (!transfer?.id) throw new Error("yc_transfer_not_found")

  const transferMeta = asMeta(transfer.metadata)
  const existingVaultHash = String(transferMeta.user_vault_tx_hash ?? txMeta.user_vault_tx_hash ?? "").trim()
  if (existingVaultHash) {
    console.log(JSON.stringify({ ok: true, reason: "already_repaired", user_vault_tx_hash: existingVaultHash }, null, 2))
    return
  }

  const creditAmt = Number(
    transferMeta.usd_credit_applied ?? transferMeta.usd_credit ?? txMeta.usd_credit ?? tx.amount ?? 0,
  )
  if (!Number.isFinite(creditAmt) || creditAmt <= 0) {
    throw new Error("invalid_credit_amount")
  }

  const userId = String(tx.user_id)
  const businessId = tx.business_id ? String(tx.business_id) : null
  const userVault = await resolveUserVault(admin, userId, businessId)
  if (!userVault) throw new Error("user_vault_missing")

  const omnibusBalance = await readOmnibusUsdcBalance()
  const sendAmt = Math.min(creditAmt, omnibusBalance)
  if (!Number.isFinite(sendAmt) || sendAmt <= 0) {
    throw new Error(`omnibus_insufficient: need=${creditAmt} available=${omnibusBalance}`)
  }
  const shortfall = creditAmt > sendAmt ? creditAmt - sendAmt : 0

  console.log(
    JSON.stringify(
      {
        etid,
        transferId: transfer.id,
        transactionId: tx.id,
        creditAmt,
        sendAmt,
        omnibusBalance,
        shortfall,
        userVault,
        dryRun,
      },
      null,
      2,
    ),
  )

  if (dryRun) {
    console.log("[dry-run] would send USDC from omnibus to user vault")
    return
  }

  const send = await sendFromOmnibus({
    destinationAddress: userVault,
    amount: sendAmt,
  })

  console.log("send_result", JSON.stringify(send, null, 2))
  if (send.status === "failed") {
    throw new Error(send.errorMessage ?? "omnibus_send_failed")
  }
  if (!send.txHash) {
    throw new Error(
      `omnibus_send_pending_no_hash: poll send id ${send.providerTransactionId ?? "unknown"} then re-run with --finalize`,
    )
  }

  const now = new Date().toISOString()
  const nextTransferMeta = {
    ...transferMeta,
    fund_balance_split_status: "completed",
    user_vault_send_id: send.providerTransactionId,
    user_vault_tx_hash: send.txHash,
    usd_credit_applied: creditAmt,
    user_vault_amount_sent: sendAmt,
    ...(shortfall > 0
      ? {
          ops_alert: "stranded_omnibus_partial_repair",
          stranded_omnibus_shortfall: shortfall,
        }
      : {}),
    stranded_omnibus_repair_at: now,
    stranded_omnibus_repair_note: "manual_omnibus_to_vault_no_ledger_recredit",
  }

  await admin
    .from("yc_transfers")
    .update({
      metadata: nextTransferMeta,
      updated_at: now,
    })
    .eq("id", transfer.id)

  const nextTxMeta = {
    ...txMeta,
    fund_balance_split_status: "completed",
    user_vault_tx_hash: send.txHash,
    user_vault_send_id: send.providerTransactionId,
    user_vault_amount_sent: sendAmt,
    ...(shortfall > 0
      ? {
          ops_alert: "stranded_omnibus_partial_repair",
          stranded_omnibus_shortfall: shortfall,
        }
      : {}),
    stranded_omnibus_repair_at: now,
    yc_omnibus_tx_hash: transferMeta.leg1_omnibus_tx_hash ?? txMeta.yc_omnibus_tx_hash,
  }

  await admin
    .from("transactions")
    .update({
      tx_hash: send.txHash,
      metadata: nextTxMeta,
      updated_at: now,
    })
    .eq("id", tx.id)

  console.log(
    JSON.stringify(
      {
        ok: true,
        etid,
        user_vault_tx_hash: send.txHash,
        amount: sendAmt,
        creditAmt,
        shortfall,
        ledger_recredited: false,
      },
      null,
      2,
    ),
  )
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

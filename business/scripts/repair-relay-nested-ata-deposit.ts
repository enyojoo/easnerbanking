#!/usr/bin/env node
/**
 * Recover Relay USDT deposits stranded in a nested SPL ATA (ATA used as Relay recipient).
 *
 * On-chain funds in the nested ATA cannot be signed out by the vault. This script:
 * 1. Credits the relay deposit ledger (using the Relay fill tx hash)
 * 2. Sends equivalent USDC from the deposit omnibus to the user's vault (on-chain make-good)
 *
 * Usage:
 *   cd business && node --env-file=.env.local --import tsx scripts/repair-relay-nested-ata-deposit.ts --deposit-id=<uuid> --dry-run
 *   cd business && node --env-file=.env.local --import tsx scripts/repair-relay-nested-ata-deposit.ts --deposit-id=<uuid> --execute
 */
import { Connection, PublicKey } from "@solana/web3.js"
import { createClient } from "@supabase/supabase-js"
import { mintForStablecoinAsset } from "../lib/solana/spl-mints"
import { inspectNestedAtaTrap } from "../lib/relay-deposit/nested-ata-trap"
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
import { applyWalletBalanceDelta } from "../lib/wallet/wallet-balances-db"
import { generateTransactionId } from "../lib/transaction-id"

function readArg(name: string): string | null {
  const prefix = `--${name}=`
  const hit = process.argv.find((arg) => arg.startsWith(prefix))
  return hit ? hit.slice(prefix.length).trim() : null
}

async function resolveVaultForOwner(
  admin: ReturnType<typeof createClient>,
  walletOwnerId: string,
): Promise<string | null> {
  const { data } = await admin
    .from("wallet_accounts")
    .select("address")
    .eq("wallet_owner_id", walletOwnerId)
    .eq("chain", "solana")
    .eq("asset", "USDC")
    .eq("status", "active")
    .maybeSingle()
  const address = String(data?.address ?? "").trim()
  return address || null
}

async function resolveOwnerScope(
  admin: ReturnType<typeof createClient>,
  walletOwnerId: string,
): Promise<{ userId: string; businessId: string | null } | null> {
  const { data: owner } = await admin
    .from("wallet_owners")
    .select("owner_type, owner_ref")
    .eq("id", walletOwnerId)
    .maybeSingle()
  if (!owner?.owner_ref || !owner?.owner_type) return null

  if (owner.owner_type === "business") {
    const businessId = String(owner.owner_ref)
    const { data: orgOwner } = await admin
      .from("users")
      .select("id")
      .eq("easner_business_id", businessId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle()
    const userId = orgOwner?.id ? String(orgOwner.id) : null
    if (!userId) return null
    return { userId, businessId }
  }

  return { userId: String(owner.owner_ref), businessId: null }
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

function resolveRelayDepositCustomerFee(row: {
  gross_usdt?: number | null
  posted_amount?: number | null
  relay_fee?: number | null
  easner_deposit_fee?: number | null
}): number {
  const gross = Number(row.gross_usdt ?? 0)
  const posted = Number(row.posted_amount ?? 0)
  if (Number.isFinite(gross) && gross > 0 && Number.isFinite(posted) && gross > posted) {
    return Math.round((gross - posted) * 1_000_000) / 1_000_000
  }
  const relayFee = Number(row.relay_fee ?? 0)
  const easnerFee = Number(row.easner_deposit_fee ?? 0)
  const combined = (Number.isFinite(relayFee) ? relayFee : 0) + (Number.isFinite(easnerFee) ? easnerFee : 0)
  return combined > 0 ? Math.round(combined * 1_000_000) / 1_000_000 : 0
}

async function creditRelayDepositLedger(
  admin: ReturnType<typeof createClient>,
  row: Record<string, unknown>,
): Promise<{ credited: boolean; reason?: string; transactionId?: string }> {
  if (row.ledger_tx_id) return { credited: false, reason: "already_credited" }

  const postedAmount = Number(row.posted_amount ?? 0)
  if (!Number.isFinite(postedAmount) || postedAmount <= 0) {
    return { credited: false, reason: "invalid_posted_amount" }
  }

  const txHash = String(row.turnkey_tx_hash || "").trim()
  if (!txHash) return { credited: false, reason: "missing_turnkey_tx_hash" }

  const scope = await resolveOwnerScope(admin, String(row.wallet_owner_id))
  if (!scope) return { credited: false, reason: "owner_not_found" }

  let existingQ = admin
    .from("transactions")
    .select("id")
    .eq("provider", "relay")
    .eq("direction", "in")
    .eq("status", "settled")
    .eq("tx_hash", txHash)
  existingQ = scope.businessId
    ? existingQ.eq("business_id", scope.businessId)
    : existingQ.eq("user_id", scope.userId).is("business_id", null)
  const { data: existing } = await existingQ.maybeSingle()
  if (existing?.id) {
    await admin
      .from("relay_deposits")
      .update({ status: "settled", ledger_tx_id: existing.id, updated_at: new Date().toISOString() })
      .eq("id", row.id)
    return { credited: false, reason: "ledger_already_exists", transactionId: String(existing.id) }
  }

  const occurredAt = new Date().toISOString()
  const customerFee = resolveRelayDepositCustomerFee({
    gross_usdt: row.gross_usdt as number | null,
    posted_amount: row.posted_amount as number | null,
    relay_fee: row.relay_fee as number | null,
    easner_deposit_fee: row.easner_deposit_fee as number | null,
  })
  const depositMeta =
    row.metadata && typeof row.metadata === "object"
      ? (row.metadata as Record<string, unknown>)
      : {}
  const senderTronAddress =
    typeof depositMeta.sender_tron_address === "string"
      ? depositMeta.sender_tron_address.trim()
      : ""

  const { data: inserted, error } = await admin
    .from("transactions")
    .insert({
      user_id: scope.userId,
      business_id: scope.businessId,
      provider: "relay",
      provider_transaction_id: String(row.relay_request_id || row.id),
      status: "settled",
      amount: postedAmount,
      currency: "USD",
      base_currency: "USD",
      direction: "in",
      occurred_at: occurredAt,
      settled_at: occurredAt,
      tx_hash: txHash,
      easner_transaction_id: generateTransactionId(),
      metadata: {
        activity_type: "relay_tron_deposit",
        source_type: "relay_tron_deposit",
        source_payment_rail: "tron",
        source_currency: "USDT",
        tron_address: row.tron_address,
        gross_usdt: row.gross_usdt,
        relay_fee: row.relay_fee,
        on_chain_usdc: row.on_chain_usdc,
        easner_deposit_fee: row.easner_deposit_fee,
        fee_amount: customerFee > 0 ? customerFee : undefined,
        posted_amount: postedAmount,
        posted_currency: "USD",
        ...(senderTronAddress ? { sender_tron_address: senderTronAddress, from_address: senderTronAddress } : {}),
        relay_request_id: row.relay_request_id,
        balance_delta_applied: true,
        nested_ata_trap_repair: true,
      },
    })
    .select("id")
    .single()

  if (error) throw error

  await applyWalletBalanceDelta(admin, {
    userId: scope.userId,
    businessId: scope.businessId,
    currency: "USD",
    delta: postedAmount,
  })

  await admin
    .from("relay_deposits")
    .update({
      status: "settled",
      ledger_tx_id: inserted.id,
      updated_at: occurredAt,
    })
    .eq("id", row.id)

  return { credited: true, transactionId: String(inserted.id) }
}

async function main() {
  const depositId = readArg("deposit-id")
  const relayRequestId = readArg("relay-request-id")
  const dryRun = !process.argv.includes("--execute")

  if (!depositId && !relayRequestId) {
    throw new Error("Pass --deposit-id=<uuid> or --relay-request-id=<id>")
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error("supabase_not_configured")

  const admin = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  let resolvedId = depositId
  if (!resolvedId && relayRequestId) {
    const { data } = await admin
      .from("relay_deposits")
      .select("id")
      .eq("relay_request_id", relayRequestId)
      .maybeSingle()
    resolvedId = data?.id ? String(data.id) : null
  }
  if (!resolvedId) throw new Error("relay_deposit_not_found")

  const { data: row } = await admin.from("relay_deposits").select("*").eq("id", resolvedId).maybeSingle()
  if (!row?.id) throw new Error("relay_deposit_not_found")

  const meta =
    row.metadata && typeof row.metadata === "object"
      ? (row.metadata as Record<string, unknown>)
      : {}
  if (meta.nested_ata_makegood_tx_hash) {
    console.log(
      JSON.stringify(
        { ok: true, reason: "already_repaired", makegoodTxHash: meta.nested_ata_makegood_tx_hash },
        null,
        2,
      ),
    )
    return
  }

  const vault = await resolveVaultForOwner(admin, String(row.wallet_owner_id))
  if (!vault) throw new Error("vault_not_found")

  const inspection = await inspectNestedAtaTrap({ vaultAddress: vault })
  const amount = Number(row.posted_amount ?? row.on_chain_usdc ?? 0)
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("invalid_posted_amount")

  const omnibusBalance = await readOmnibusUsdcBalance()

  console.log(
    JSON.stringify(
      {
        depositId: resolvedId,
        dryRun,
        inspection: {
          ...inspection,
          nestedBalanceAtomic: inspection.nestedBalanceAtomic.toString(),
        },
        amountToMakegood: amount,
        omnibusBalance,
        note: inspection.recoverableOnChain
          ? "Unexpected: nested funds appear recoverable on-chain"
          : "Nested ATA trap – ledger credit + omnibus make-good",
      },
      null,
      2,
    ),
  )

  if (dryRun) return

  const credit = await creditRelayDepositLedger(admin, row)
  console.log("ledger_credit", JSON.stringify(credit, null, 2))
  if (!credit.credited && credit.reason !== "ledger_already_exists" && credit.reason !== "already_credited") {
    throw new Error(`ledger_credit_failed:${credit.reason ?? "unknown"}`)
  }

  let makegood:
    | { status: string; txHash: string | null; providerTransactionId: string | null; errorMessage: string | null }
    | { status: "skipped"; reason: string }
  if (omnibusBalance < amount) {
    makegood = {
      status: "skipped",
      reason: `omnibus_insufficient: need=${amount} available=${omnibusBalance}`,
    }
    console.warn("omnibus_makegood_skipped", JSON.stringify(makegood, null, 2))
  } else {
    const send = await sendFromOmnibus({
      destinationAddress: vault,
      amount,
    })
    console.log("omnibus_makegood", JSON.stringify(send, null, 2))
    if (send.status !== "settled" || !send.txHash) {
      throw new Error(`omnibus_makegood_failed:${send.status}:${send.errorMessage ?? "unknown"}`)
    }
    makegood = send
  }

  await admin
    .from("relay_deposits")
    .update({
      metadata: {
        ...meta,
        nested_ata_trap: true,
        nested_ata_address: inspection.nestedAta,
        nested_ata_balance_human: inspection.nestedBalanceHuman,
        ...(makegood.status === "settled" && makegood.txHash
          ? {
              nested_ata_makegood_tx_hash: makegood.txHash,
              nested_ata_makegood_amount: amount,
            }
          : {
              nested_ata_makegood_pending: true,
              nested_ata_makegood_amount: amount,
              nested_ata_makegood_skip_reason:
                makegood.status === "skipped" ? makegood.reason : makegood.errorMessage,
            }),
      },
      updated_at: new Date().toISOString(),
    })
    .eq("id", resolvedId)

  console.log(JSON.stringify({ ok: true, credit, makegood }, null, 2))
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})

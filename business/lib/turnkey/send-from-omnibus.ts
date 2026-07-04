import { Connection } from "@solana/web3.js"
import { getTurnkeyApiClient } from "@/lib/turnkey/client"
import {
  getTurnkeyOrganizationId,
  getTurnkeySolanaBroadcastCaip2,
  isTurnkeySolSponsorshipEnabled,
} from "@/lib/turnkey/config"
import {
  interpretTurnkeyGetSendTransactionStatus,
  pollUntilTurnkeySendTerminal,
  resolveSolSendParsedIds,
} from "@/lib/turnkey/send"
import { buildStablecoinSplTransferUnsignedTxPayloadForTurnkey, getSolanaRpcUrl } from "@/lib/turnkey/sol-spl-transfer-unsigned-tx"
import { isDepositSplitDryRun, resolveDepositOmnibusAddressForLedgerCurrency } from "@/lib/deposit-omnibus/config"

export type SendFromOmnibusInput = {
  ledgerCurrency: "USD" | "EUR"
  asset: "USDC" | "EURC"
  destinationAddress: string
  amount: number
  /** When false, return immediately after submit without polling. */
  pollForSettlement?: boolean
  settlementPollTimeoutMs?: number
}

export type SendFromOmnibusResult = {
  dryRun: boolean
  providerTransactionId: string | null
  sendTransactionStatusId: string | null
  status: "pending" | "settled" | "failed" | "skipped"
  txHash: string | null
  errorMessage: string | null
}

export async function sendStablecoinFromDepositOmnibus(
  input: SendFromOmnibusInput,
): Promise<SendFromOmnibusResult> {
  const amount = Number(input.amount)
  const destinationAddress = String(input.destinationAddress || "").trim()
  if (!destinationAddress || !Number.isFinite(amount) || amount <= 0) {
    return {
      dryRun: false,
      providerTransactionId: null,
      sendTransactionStatusId: null,
      status: "failed",
      txHash: null,
      errorMessage: "invalid_send_input",
    }
  }

  if (isDepositSplitDryRun()) {
    return {
      dryRun: true,
      providerTransactionId: `dry_run_omnibus_${Date.now()}`,
      sendTransactionStatusId: null,
      status: "skipped",
      txHash: null,
      errorMessage: null,
    }
  }

  const omnibusAddress = resolveDepositOmnibusAddressForLedgerCurrency(input.ledgerCurrency)
  if (!omnibusAddress) {
    return {
      dryRun: false,
      providerTransactionId: null,
      sendTransactionStatusId: null,
      status: "failed",
      txHash: null,
      errorMessage: "omnibus_address_not_configured",
    }
  }

  const orgId = getTurnkeyOrganizationId()
  const client = getTurnkeyApiClient() as Record<string, (...args: unknown[]) => Promise<unknown>> | null
  if (!orgId || !client || typeof client.solSendTransaction !== "function") {
    return {
      dryRun: false,
      providerTransactionId: null,
      sendTransactionStatusId: null,
      status: "failed",
      txHash: null,
      errorMessage: "turnkey_not_configured",
    }
  }

  const sponsor = isTurnkeySolSponsorshipEnabled()
  const caip2 = getTurnkeySolanaBroadcastCaip2()
  const connection = new Connection(getSolanaRpcUrl(), "confirmed")
  const { blockhash } = await connection.getLatestBlockhash("finalized")

  const unsignedTransaction = await buildStablecoinSplTransferUnsignedTxPayloadForTurnkey({
    asset: input.asset,
    ownerAddress: omnibusAddress,
    destinationAddress,
    destinationIsTokenAccount: false,
    amountHuman: amount,
    sponsoredFlow: sponsor,
    recentBlockhash: blockhash,
  })

  let sendRes: unknown
  try {
    sendRes = await client.solSendTransaction({
      organizationId: orgId,
      unsignedTransaction,
      signWith: omnibusAddress,
      caip2,
      ...(sponsor ? { sponsor: true, recentBlockhash: blockhash } : {}),
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return {
      dryRun: false,
      providerTransactionId: null,
      sendTransactionStatusId: null,
      status: "failed",
      txHash: null,
      errorMessage: msg.slice(0, 500),
    }
  }

  const parsed = await resolveSolSendParsedIds(client, orgId, (sendRes || {}) as Record<string, unknown>)
  const providerTransactionId = parsed.providerTransactionId
  const sendStatusId = parsed.sendStatusId

  let status: "pending" | "settled" | "failed" = parsed.txHash ? "settled" : "pending"
  let txHash = parsed.txHash

  const shouldPoll = input.pollForSettlement !== false && sendStatusId
  if (shouldPoll && sendStatusId) {
    const timeoutMs = input.settlementPollTimeoutMs ?? 45_000
    const terminal = await pollUntilTurnkeySendTerminal(client, orgId, sendStatusId, {
      timeoutMs,
      intervalMs: 1_000,
    })
    if (terminal) {
      const interpreted = interpretTurnkeyGetSendTransactionStatus(terminal)
      status = interpreted.status
      txHash = interpreted.txHash ?? txHash
    }
  }

  return {
    dryRun: false,
    providerTransactionId,
    sendTransactionStatusId: sendStatusId,
    status,
    txHash,
    errorMessage: status === "failed" ? "turnkey_send_failed" : null,
  }
}

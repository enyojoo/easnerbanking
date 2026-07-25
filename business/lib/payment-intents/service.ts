import { randomUUID } from "node:crypto"
import type { SupabaseClient } from "@supabase/supabase-js"
import type { NoahAccountContext } from "@/lib/noah/resolve-account-context"
import {
  pickNoahWorkflowIdFromResponse,
  startBankDepositToOnchainAddress,
} from "@/lib/noah/bank-onramp-workflow"
import {
  resolveTurnkeyAddressForNoahPair,
  resolveWalletOwnerIdForEasnerContext,
} from "@/lib/wallet/resolve-wallet-owner"
import { prepareSellFromRecipientRow, type RecipientSellPrepareRow } from "@/lib/terminal/recipient-sell-prepare"
import {
  pickDestinationAddress,
  pickTriggerCryptoAmount,
  startOnchainDepositToPaymentWorkflow,
} from "@/lib/terminal/automated-payout-workflow"
import { isNewPaymentIntentsPaused } from "@/lib/ops/safe-mode"
import { assertBusinessTransferAllowed } from "@/lib/business/high-value-policy"
import { ledgerCurrencyForStablecoinAsset, resolvePooledSolanaSourceAddress } from "@/lib/liquidity/platform-pool"

export async function createOnRampPaymentIntent(input: {
  admin: SupabaseClient
  ctx: NoahAccountContext
  userId: string
  fiatCurrency: string
  cryptoCurrency: string
  network: string
  quoteId?: string | null
  idempotencyKey?: string | null
}): Promise<{ intentId: string; noah: Record<string, unknown>; destinationAddress: string }> {
  if (isNewPaymentIntentsPaused()) {
    throw new Error("New payment intents are paused (safe mode).")
  }

  const idem = input.idempotencyKey?.trim()
  if (idem) {
    const { data: existing } = await input.admin
      .from("payment_intents")
      .select("id, intent_snapshot")
      .eq("idempotency_key", idem)
      .maybeSingle()
    if (existing?.id) {
      const snap = (existing.intent_snapshot || {}) as Record<string, unknown>
      const dest = String(snap.destinationAddress || "")
      const noah = (snap.noahResponse || {}) as Record<string, unknown>
      if (!dest) throw new Error("Stored idempotent intent is missing destinationAddress.")
      return { intentId: String(existing.id), noah, destinationAddress: dest }
    }
  }

  const destination =
    (await resolveTurnkeyAddressForNoahPair(
      input.admin,
      input.ctx,
      input.cryptoCurrency,
      input.network,
    ))?.trim() || ""
  if (!destination) {
    throw new Error(
      "No active Turnkey wallet address for this asset/network. Complete wallet provisioning after KYC or link a sub-organization.",
    )
  }

  const noahRaw = await startBankDepositToOnchainAddress({
    customerId: input.ctx.noahCustomerId,
    fiatCurrency: input.fiatCurrency.trim().toUpperCase(),
    cryptoCurrency: input.cryptoCurrency.trim(),
    network: input.network.trim(),
    destinationAddress: destination,
  })

  const workflowId = pickNoahWorkflowIdFromResponse(noahRaw)
  const walletOwnerId = await resolveWalletOwnerIdForEasnerContext(input.admin, input.ctx)

  const { data: row, error } = await input.admin
    .from("payment_intents")
    .insert({
      wallet_owner_id: walletOwnerId,
      user_id: input.ctx.scope === "business" ? input.userId : input.ctx.subjectUserId,
      business_id: input.ctx.subjectBusinessId,
      quote_id: input.quoteId?.trim() || null,
      flow_type: "onramp",
      source_currency: input.fiatCurrency.trim().toUpperCase(),
      destination_currency: input.cryptoCurrency.trim(),
      network: input.network.trim(),
      chain: input.network.trim(),
      noah_workflow_id: workflowId,
      intent_snapshot: {
        destinationAddress: destination,
        noahResponse: noahRaw,
        cryptoCurrency: input.cryptoCurrency,
        network: input.network,
      } as object,
      status: "awaiting_fiat",
      idempotency_key: idem || null,
    })
    .select("id")
    .single()

  if (error) throw error
  return { intentId: String(row!.id), noah: noahRaw, destinationAddress: destination }
}

export async function createOffRampPaymentIntent(input: {
  admin: SupabaseClient
  ctx: NoahAccountContext
  userId: string
  recipientRow: RecipientSellPrepareRow
  recipientId: string
  fiatAmount: number
  cryptoCurrency: string
  network: string
  sourceAddress?: string | null
  quoteId?: string | null
  idempotencyKey?: string | null
}): Promise<{
  intentId: string
  destinationAddress: string | null
  workflowRaw: Record<string, unknown>
  formSessionId: string
}> {
  if (isNewPaymentIntentsPaused()) {
    throw new Error("New payment intents are paused (safe mode).")
  }

  if (input.ctx.scope === "business" && input.ctx.subjectBusinessId) {
    await assertBusinessTransferAllowed(
      input.admin,
      input.ctx.subjectBusinessId,
      input.fiatAmount,
      String(input.recipientRow.currency || "USD"),
      input.userId,
    )
  }

  const idem = input.idempotencyKey?.trim()
  if (idem) {
    const { data: existing } = await input.admin
      .from("payment_intents")
      .select("id, intent_snapshot")
      .eq("idempotency_key", idem)
      .maybeSingle()
    if (existing?.id) {
      const snap = (existing.intent_snapshot || {}) as Record<string, unknown>
      return {
        intentId: String(existing.id),
        destinationAddress: (snap.depositDestination as string) ?? null,
        workflowRaw: (snap.workflowRaw as Record<string, unknown>) || {},
        formSessionId: String(snap.formSessionId || ""),
      }
    }
  }

  let sourceAddress = (input.sourceAddress || "").trim()
  if (!sourceAddress) {
    const lc = ledgerCurrencyForStablecoinAsset(input.cryptoCurrency.trim().toUpperCase())
    if (lc) {
      sourceAddress = (await resolvePooledSolanaSourceAddress(input.admin, { ledgerCurrency: lc }))?.trim() || ""
    }
  }
  if (!sourceAddress) {
    sourceAddress =
      (await resolveTurnkeyAddressForNoahPair(
        input.admin,
        input.ctx,
        input.cryptoCurrency,
        input.network,
      ))?.trim() || ""
  }
  if (!sourceAddress) {
    throw new Error(
      "source_address is required for offramp, or provision a Turnkey wallet for this asset/network.",
    )
  }

  const prep = await prepareSellFromRecipientRow({
    row: input.recipientRow,
    fiatAmount: input.fiatAmount,
    cryptoCurrency: input.cryptoCurrency,
    noahCustomerId: input.ctx.noahCustomerId,
  })
  const formSessionId = prep.prep.formSessionId?.trim()
  if (!formSessionId) {
    throw new Error("Noah did not return a form session for this offramp.")
  }

  const cryptoTrigger = pickTriggerCryptoAmount(
    prep.prep.cryptoAuthorizedAmount || "",
    prep.prep.cryptoAmountEstimate || "",
  )

  const intentId = randomUUID()

  const workflowRaw = await startOnchainDepositToPaymentWorkflow({
    customerId: input.ctx.noahCustomerId,
    cryptoCurrency: input.cryptoCurrency,
    fiatAmount: input.fiatAmount.toFixed(2),
    formSessionId,
    externalId: intentId,
    network: input.network,
    sourceAddress,
    cryptoTriggerAmount: cryptoTrigger,
  })

  const destination = pickDestinationAddress(workflowRaw)
  const walletOwnerId = await resolveWalletOwnerIdForEasnerContext(input.admin, input.ctx)

  const { data: row, error } = await input.admin
    .from("payment_intents")
    .insert({
      id: intentId,
      wallet_owner_id: walletOwnerId,
      user_id: input.ctx.scope === "business" ? input.userId : input.ctx.subjectUserId,
      business_id: input.ctx.subjectBusinessId,
      quote_id: input.quoteId?.trim() || null,
      flow_type: "offramp",
      source_currency: input.cryptoCurrency,
      destination_currency: String(input.recipientRow.currency || "").toUpperCase(),
      amount: input.fiatAmount,
      network: input.network,
      chain: input.network,
      noah_workflow_id: pickNoahWorkflowIdFromResponse(workflowRaw),
      intent_snapshot: {
        formSessionId,
        sourceAddress,
        depositDestination: destination,
        workflowRaw,
        recipientId: input.recipientId,
        externalId: intentId,
      } as object,
      status: "awaiting_crypto_deposit",
      idempotency_key: idem || null,
    })
    .select("id")
    .single()

  if (error) throw error
  return {
    intentId: String(row!.id),
    destinationAddress: destination,
    workflowRaw,
    formSessionId,
  }
}

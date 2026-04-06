import type { SupabaseClient } from "@supabase/supabase-js"
import {
  prepareSellFromRecipientRow,
  type RecipientSellPrepareRow,
} from "@/lib/terminal/recipient-sell-prepare"
import {
  pickDestinationAddress,
  pickTriggerCryptoAmount,
  startOnchainDepositToPaymentWorkflow,
} from "@/lib/terminal/automated-payout-workflow"

export async function provisionAutopayoutDepositAddress(input: {
  admin: SupabaseClient
  autopayoutId: string
  businessId: string
  recipientRow: RecipientSellPrepareRow
  cryptoCurrency: string
  network: string
  /** Nominal amount for Noah prepare/workflow only. */
  fiatPrepareAmount: number
  prepareFiatCurrency: string
  noahCustomerId: string
  sourceAddress: string
}): Promise<{ destinationAddress: string; workflowRaw: Record<string, unknown>; cryptoExpected: string | null }> {
  const {
    admin,
    autopayoutId,
    businessId: _businessId,
    recipientRow,
    cryptoCurrency,
    network,
    fiatPrepareAmount,
    prepareFiatCurrency,
    noahCustomerId,
    sourceAddress,
  } = input
  void _businessId

  let prep: Awaited<ReturnType<typeof prepareSellFromRecipientRow>>
  try {
    prep = await prepareSellFromRecipientRow({
      row: recipientRow,
      fiatAmount: fiatPrepareAmount,
      cryptoCurrency,
      noahCustomerId,
    })
  } catch (e) {
    await admin
      .from("autopayout_configs")
      .update({ status: "failed", updated_at: new Date().toISOString() })
      .eq("id", autopayoutId)
    throw e
  }

  const formSessionId = prep.prep.formSessionId?.trim()
  if (!formSessionId) {
    await admin
      .from("autopayout_configs")
      .update({ status: "failed", updated_at: new Date().toISOString() })
      .eq("id", autopayoutId)
    throw new Error("Could not start payout session for Autopayout.")
  }

  await admin
    .from("autopayout_configs")
    .update({
      noah_form_session_id: formSessionId,
      prepare_fiat_currency: prepareFiatCurrency,
      fiat_prepare_amount: fiatPrepareAmount,
      crypto_amount_expected: prep.prep.cryptoAuthorizedAmount || prep.prep.cryptoAmountEstimate || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", autopayoutId)

  const cryptoTrigger = pickTriggerCryptoAmount(
    prep.prep.cryptoAuthorizedAmount || "",
    prep.prep.cryptoAmountEstimate || "",
  )

  let workflowRaw: Record<string, unknown>
  try {
    workflowRaw = await startOnchainDepositToPaymentWorkflow({
      customerId: noahCustomerId,
      cryptoCurrency,
      fiatAmount: fiatPrepareAmount.toFixed(2),
      formSessionId,
      externalId: autopayoutId,
      network,
      sourceAddress,
      cryptoTriggerAmount: cryptoTrigger,
    })
  } catch (e) {
    await admin
      .from("autopayout_configs")
      .update({ status: "failed", updated_at: new Date().toISOString() })
      .eq("id", autopayoutId)
    throw e
  }

  const destination = pickDestinationAddress(workflowRaw)?.trim() || ""
  if (!destination) {
    await admin
      .from("autopayout_configs")
      .update({ status: "failed", updated_at: new Date().toISOString() })
      .eq("id", autopayoutId)
    throw new Error("No deposit destination returned from workflow.")
  }

  const exp = new Date(Date.now() + 60 * 60 * 1000).toISOString()

  await admin
    .from("autopayout_configs")
    .update({
      status: "awaiting_deposit",
      deposit_address: destination,
      deposit_memo: null,
      noah_workflow_raw: workflowRaw as object,
      noah_trigger_json: (workflowRaw.Trigger ?? workflowRaw.trigger ?? null) as object | null,
      source_address: sourceAddress,
      expires_at: exp,
      updated_at: new Date().toISOString(),
    })
    .eq("id", autopayoutId)

  return {
    destinationAddress: destination,
    workflowRaw,
    cryptoExpected: prep.prep.cryptoAuthorizedAmount || prep.prep.cryptoAmountEstimate || null,
  }
}

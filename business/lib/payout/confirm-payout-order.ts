import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { resolveBusinessOrgOwnerUserId } from "@/lib/business/org-owner"
import { buildPayoutQuote } from "@/lib/noah/payout-quote"
import { selectProviderForCorridor } from "@/lib/payout-providers"
import { resolveRecipientPayoutCountry, type RecipientSellPrepareRow } from "@/lib/terminal/recipient-sell-prepare"
import { confirmGridBalancePayoutOrder, prefetchGridBalancePayoutLiveQuote } from "@/lib/payout/confirm-grid-balance-payout"
import { confirmNoahPayoutOrder } from "@/lib/payout/confirm-noah-payout"
import { confirmYcBalancePayoutOrder } from "@/lib/payout/confirm-yc-balance-payout"
import { isPayoutLockOnReviewEnabled } from "@/lib/payout/payout-lock-flags"
import type { PayoutQuoteResult } from "@/lib/noah/payout-quote"
import type { NoahAccountContext } from "@/lib/noah/resolve-account-context"
import { getWalletOwnerId } from "@/lib/wallet/resolve-wallet-owner"

export type ConfirmPayoutOrderInput = {
  ctx: NoahAccountContext
  userId: string
  businessId: string | null
  noahCustomerId: string
  recipientId: string
  destinationRef?: string
  receiveAmount: number
  sourceBalanceCurrency: string
  amountEntryMode?: "send" | "receive"
  sendAmount?: number
  note?: string
  paymentPurpose?: string
  recipient: RecipientSellPrepareRow
  /** Background Grid POST /quotes. Review confirm must not set this. */
  gridLiveQuote?: boolean
}

export async function confirmPayoutOrder(
  input: ConfirmPayoutOrderInput,
): Promise<PayoutQuoteResult> {
  const admin = createSupabaseAdmin()
  const recipient = input.recipient
  const receiveCurrency = String(recipient.currency || "").trim().toUpperCase()
  const countryCode = resolveRecipientPayoutCountry(recipient)
  if (!countryCode) throw new Error("Recipient country is required for payout.")

  const [orgOwner, provider] = await Promise.all([
    input.ctx.scope === "business" && input.businessId
      ? resolveBusinessOrgOwnerUserId(admin, input.businessId).catch(() => null)
      : Promise.resolve(null),
    selectProviderForCorridor(admin, {
      countryCode,
      currencyCode: receiveCurrency,
      rail:
        recipient.mobile_provider || String(recipient.bank_name || "").toLowerCase().includes("mobile money")
          ? "mobile_money"
          : "bank_transfer",
      mobileProvider: recipient.mobile_provider,
      bankName: recipient.bank_name,
      businessId: input.businessId,
      userId: input.userId,
    }),
  ])
  const kycUserId = orgOwner ?? input.userId
  const providerId = provider.id

  const amountEntryMode = input.amountEntryMode === "send" ? "send" : "receive"
  const sendBudget =
    amountEntryMode === "send" && input.sendAmount != null && input.sendAmount > 0
      ? input.sendAmount
      : undefined

  if (providerId === "grid" && isPayoutLockOnReviewEnabled("grid")) {
    if (input.gridLiveQuote) {
      const { data: userRow } = await admin
        .from("users")
        .select(
          "residence_country,kyc_id_type,kyc_id_number,ng_local_id_type,ng_local_id_number,full_name,phone,email,date_of_birth,kyc_address_street,kyc_address_city,kyc_address_country",
        )
        .eq("id", kycUserId)
        .maybeSingle()
      const senderProfile = {
        residenceCountry: userRow?.residence_country,
        kycIdType: userRow?.kyc_id_type,
        kycIdNumber: userRow?.kyc_id_number,
        ngLocalIdType: userRow?.ng_local_id_type,
        ngLocalIdNumber: userRow?.ng_local_id_number,
        fullName: userRow?.full_name,
        phone: userRow?.phone,
        email: userRow?.email,
        dateOfBirth: userRow?.date_of_birth,
        addressStreet: userRow?.kyc_address_street,
        addressCity: userRow?.kyc_address_city,
        addressCountry: userRow?.kyc_address_country,
      }
      await prefetchGridBalancePayoutLiveQuote({
        admin,
        userId: kycUserId,
        businessId: input.businessId,
        recipientId: input.recipientId,
        destinationRef: input.destinationRef,
        recipient,
        receiveFiatAmount: input.receiveAmount,
        sourceBalanceCurrency: input.sourceBalanceCurrency,
        amountEntryMode,
        sendBudget,
        senderProfile,
        paymentPurpose: input.paymentPurpose,
      })
    }

    return confirmGridBalancePayoutOrder({
      admin,
      userId: kycUserId,
      businessId: input.businessId,
      recipientId: input.recipientId,
      destinationRef: input.destinationRef,
      recipient,
      receiveFiatAmount: input.receiveAmount,
      sourceBalanceCurrency: input.sourceBalanceCurrency,
      amountEntryMode,
      sendBudget,
      paymentPurpose: input.paymentPurpose,
    })
  }

  if (providerId === "yellowcard") {
    const walletOwnerId = await getWalletOwnerId(
      admin,
      input.businessId ? "business" : "individual",
      input.businessId ?? kycUserId,
    )
    const { data: walletRow } = walletOwnerId
      ? await admin
          .from("wallet_accounts")
          .select("address")
          .eq("wallet_owner_id", walletOwnerId)
          .eq("ledger_currency", "USD")
          .eq("asset", "USDC")
          .eq("status", "active")
          .maybeSingle()
      : { data: null }
    const turnkeyAddr = String(walletRow?.address ?? "").trim()
    if (!turnkeyAddr) {
      throw new Error("User Solana wallet is required for Yellowcard payout refund routing.")
    }

    const { data: userRow } = await admin
      .from("users")
      .select(
        "residence_country,kyc_id_type,kyc_id_number,ng_local_id_type,ng_local_id_number,full_name,phone,email,date_of_birth,kyc_address_street,kyc_address_city,kyc_address_country",
      )
      .eq("id", kycUserId)
      .maybeSingle()

    return confirmYcBalancePayoutOrder({
      admin,
      userId: kycUserId,
      businessId: input.businessId,
      recipientId: input.recipientId,
      destinationRef: input.destinationRef,
      recipient,
      receiveFiatAmount: input.receiveAmount,
      sourceBalanceCurrency: input.sourceBalanceCurrency,
      amountEntryMode,
      sendBudget,
      userTurnkeyAddress: turnkeyAddr,
      senderProfile: {
        residenceCountry: userRow?.residence_country,
        kycIdType: userRow?.kyc_id_type,
        kycIdNumber: userRow?.kyc_id_number,
        ngLocalIdType: userRow?.ng_local_id_type,
        ngLocalIdNumber: userRow?.ng_local_id_number,
        fullName: userRow?.full_name,
        phone: userRow?.phone,
        email: userRow?.email,
        dateOfBirth: userRow?.date_of_birth,
        addressStreet: userRow?.kyc_address_street,
        addressCity: userRow?.kyc_address_city,
        addressCountry: userRow?.kyc_address_country,
      },
      paymentPurpose: input.paymentPurpose,
    })
  }

  if (isPayoutLockOnReviewEnabled("noah")) {
    return confirmNoahPayoutOrder({
      admin,
      ctx: input.ctx,
      userId: kycUserId,
      businessId: input.businessId,
      noahCustomerId: input.noahCustomerId,
      recipientId: input.recipientId,
      destinationRef: input.destinationRef,
      recipient,
      receiveFiatAmount: input.receiveAmount,
      sourceBalanceCurrency: input.sourceBalanceCurrency,
      amountEntryMode,
      sendBudget,
      note: input.note,
      paymentPurpose: input.paymentPurpose,
    })
  }

  const quote = await buildPayoutQuote({
    userId: kycUserId,
    businessId: input.businessId,
    noahCustomerId: input.noahCustomerId,
    recipientId: input.recipientId,
    recipient,
    receiveFiatAmount: input.receiveAmount,
    sourceBalanceCurrency: input.sourceBalanceCurrency,
    amountEntryMode,
    sendBudget,
    prepareOverrides: {
      note: input.note,
      paymentPurpose: input.paymentPurpose,
    },
  })
  return { ...quote, quotePhase: "locked", requiresConfirm: false }
}

export { isCompleteLockedPayoutQuote } from "./payout-quote-completion"

import type { SupabaseClient } from "@supabase/supabase-js"
import type { NoahAccountContext } from "@/lib/noah/resolve-account-context"
import { resolveTurnkeyAddressForNoahPair } from "@/lib/wallet/resolve-wallet-owner"
import { resolveWalletSendToken, sourceSolVaultToken } from "@/lib/lifi/token-map"
import { quoteLifiWalletBridge, quoteLifiWalletBridgeFromAmountRaw } from "./lifi-wallet-quote"
import { parseLifiToAmountHuman } from "./lifi-from-amount"
import { meetsLifiReceiveTarget } from "./lifi-receive-search"
import {
  getWalletSendSession,
  lockWalletSendSession,
  type WalletSendSessionRow,
} from "./wallet-send-session"
import { isPayoutLockOnReviewEnabled } from "@/lib/payout/payout-lock-flags"
import type { WalletSendQuoteResult } from "./wallet-send-quote"

export async function confirmWalletSendOrder(input: {
  admin: SupabaseClient
  ctx: NoahAccountContext
  userId: string
  formSessionId: string
}): Promise<{ session: WalletSendSessionRow; quote: WalletSendQuoteResult }> {
  const session = await getWalletSendSession(input.admin, input.formSessionId, input.userId, {
    allowQuoted: true,
  })
  if (!session) {
    throw new Error("Wallet send quote expired or not found.")
  }

  let locked = session
  if (isPayoutLockOnReviewEnabled("wallet")) {
    if (session.execution_model === "lifi_bridge") {
      const balanceCurrency = session.source_balance_currency as "USD" | "EUR"
      const source = sourceSolVaultToken(balanceCurrency)
      const dest = resolveWalletSendToken(session.receive_asset, session.receive_network)
      if (!dest) throw new Error("unsupported_corridor")
      const fromAddress = await resolveTurnkeyAddressForNoahPair(
        input.admin,
        input.ctx,
        source.asset,
        "Solana",
      )
      if (!fromAddress) throw new Error("no_source_vault")
      const slippage = 0.03
      const storedFromAmountRaw = String(session.lifi_from_amount_raw || "").trim()
      let quote
      if (storedFromAmountRaw) {
        quote = await quoteLifiWalletBridgeFromAmountRaw({
          source,
          dest,
          fromAddress,
          toAddress: session.destination_address,
          fromAmountRaw: storedFromAmountRaw,
          slippage,
        })
      } else {
        quote = await quoteLifiWalletBridge({
          source,
          dest,
          fromAddress,
          toAddress: session.destination_address,
          amountEntryMode: "receive",
          receiveAmount: session.receive_amount,
          customerRate: session.customer_rate,
          lifiMid: session.lifi_mid,
          slippage,
        })
      }
      const toHuman = parseLifiToAmountHuman(quote, dest.decimals)
      if (!meetsLifiReceiveTarget(toHuman, session.receive_amount, slippage)) {
        throw new Error("Route no longer meets receive target. Go back and try again.")
      }
      await input.admin
        .from("wallet_send_sessions")
        .update({
          lifi_quote_id: quote.id,
          lifi_from_amount_raw: String(quote.estimate?.fromAmount || "").trim() || null,
          status: "locked",
        })
        .eq("form_session_id", session.form_session_id)
        .eq("user_id", input.userId)
      locked = {
        ...session,
        status: "locked",
        lifi_quote_id: quote.id,
        lifi_from_amount_raw: String(quote.estimate?.fromAmount || "").trim() || null,
      }
    } else {
      const next = await lockWalletSendSession(input.admin, session.form_session_id, input.userId)
      if (!next) throw new Error("Could not lock wallet send session.")
      locked = next
    }
  }

  const quote: WalletSendQuoteResult = {
    receiveAmount: locked.receive_amount,
    receiveCurrency: locked.receive_asset,
    receiveNetwork: locked.receive_network,
    sendAmount: locked.total_debited,
    sendCurrency: locked.source_balance_currency,
    totalDebited: locked.total_debited,
    marginAmount: locked.margin_amount,
    channelCost: 0,
    processingFee: locked.margin_amount,
    displayChannelCost: 0,
    networkFee: 0,
    rate: locked.customer_rate,
    customerRate: locked.customer_rate,
    lifiMid: locked.lifi_mid,
    expiresAt: locked.expires_at,
    formSessionId: locked.form_session_id,
    pricingQuoteId: locked.form_session_id,
    executionModel: locked.execution_model,
    wallet: {
      cryptoAuthorizedAmount: String(locked.lifi_floor),
      lifiFloor: String(locked.lifi_floor),
    },
  }

  return { session: locked, quote }
}

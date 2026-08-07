import type { SupabaseClient } from "@supabase/supabase-js"
import type { NoahAccountContext } from "@/lib/noah/resolve-account-context"
import { resolveTurnkeyAddressForNoahPair } from "@/lib/wallet/resolve-wallet-owner"
import { resolveWalletSendToken, sourceSolVaultToken } from "@/lib/relay/token-map"
import { isRelayWalletSendEnabled, requireRelayApiKey } from "@/lib/relay/config"
import { parseRelayFromAmountRaw } from "@/lib/relay/quote"
import {
  quoteRelayWalletBridge,
  quoteRelayWalletBridgeFromAmountRaw,
} from "./relay-wallet-quote"
import { parseRelayToAmountHumanFromQuote } from "./relay-from-amount"
import { meetsRelayReceiveTarget } from "./relay-receive-search"
import {
  getWalletSendSession,
  lockWalletSendSession,
  type WalletSendSessionRow,
} from "./wallet-send-session"
import { isBridgeExecutionModel } from "./routing"
import { isPayoutLockOnReviewEnabled } from "@/lib/payout/payout-lock-flags"
import type { WalletSendQuoteResult } from "./wallet-send-quote"

function sessionBridgeMid(session: WalletSendSessionRow): number {
  return session.relay_mid
}

function sessionBridgeFloor(session: WalletSendSessionRow): number {
  return session.relay_floor
}

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
    if (isBridgeExecutionModel(session.execution_model)) {
      if (!isRelayWalletSendEnabled()) {
        throw new Error("Relay wallet send is not configured.")
      }
      requireRelayApiKey()

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
      const storedFromAmountRaw = String(session.relay_from_amount_raw ?? "").trim()
      const bridgeMid = sessionBridgeMid(session)

      let quote
      if (storedFromAmountRaw) {
        quote = await quoteRelayWalletBridgeFromAmountRaw({
          user: fromAddress,
          recipient: session.destination_address,
          source,
          dest,
          fromAmountRaw: storedFromAmountRaw,
          slippageTolerance: String(Math.round(slippage * 10_000)),
        })
      } else {
        quote = await quoteRelayWalletBridge({
          source,
          dest,
          fromAddress,
          toAddress: session.destination_address,
          amountEntryMode: "receive",
          receiveAmount: session.receive_amount,
          customerRate: session.customer_rate,
          bridgeMid,
          slippage,
        })
      }
      const toHuman = parseRelayToAmountHumanFromQuote(quote, dest.decimals)
      if (!meetsRelayReceiveTarget(toHuman, session.receive_amount, slippage)) {
        throw new Error("Route no longer meets receive target. Go back and try again.")
      }
      const quoteId = String(quote.requestId ?? quote.id ?? "").trim() || null
      const fromAmountRaw = parseRelayFromAmountRaw(quote)

      await input.admin
        .from("wallet_send_sessions")
        .update({
          relay_quote_id: quoteId,
          relay_from_amount_raw: fromAmountRaw,
          status: "locked",
        })
        .eq("form_session_id", session.form_session_id)
        .eq("user_id", input.userId)
      locked = {
        ...session,
        status: "locked",
        relay_quote_id: quoteId,
        relay_from_amount_raw: fromAmountRaw,
      }
    } else {
      const next = await lockWalletSendSession(input.admin, session.form_session_id, input.userId)
      if (!next) throw new Error("Could not lock wallet send session.")
      locked = next
    }
  }

  const principalSendAmount =
    locked.execution_model === "direct_turnkey"
      ? locked.receive_amount
      : locked.customer_rate > 0
        ? Math.round((locked.receive_amount / locked.customer_rate) * 1_000_000) / 1_000_000
        : Math.max(0, locked.total_debited - locked.margin_amount)

  const bridgeFloor = sessionBridgeFloor(locked)
  const bridgeMid = sessionBridgeMid(locked)

  const processingFee =
    locked.execution_model === "direct_turnkey"
      ? locked.margin_amount
      : Math.round(
          Math.max(0, locked.total_debited - bridgeFloor - locked.margin_amount) * 1_000_000,
        ) / 1_000_000
  const displayChannelCost =
    isBridgeExecutionModel(locked.execution_model) && bridgeMid > 0
      ? Math.round(
          Math.max(0, bridgeFloor - locked.receive_amount / bridgeMid) * 1_000_000,
        ) / 1_000_000
      : 0

  const quote: WalletSendQuoteResult = {
    receiveAmount: locked.receive_amount,
    receiveCurrency: locked.receive_asset,
    receiveNetwork: locked.receive_network,
    sendAmount: principalSendAmount,
    sendCurrency: locked.source_balance_currency,
    totalDebited: locked.total_debited,
    marginAmount: locked.margin_amount,
    channelCost: displayChannelCost,
    processingFee,
    displayChannelCost,
    networkFee: 0,
    rate: locked.customer_rate,
    customerRate: locked.customer_rate,
    bridgeMid,
    relayMid: bridgeMid,
    relayFloor: String(bridgeFloor),
    expiresAt: locked.expires_at,
    formSessionId: locked.form_session_id,
    pricingQuoteId: locked.form_session_id,
    executionModel: isBridgeExecutionModel(locked.execution_model)
      ? "relay_bridge"
      : "direct_turnkey",
    wallet: {
      cryptoAuthorizedAmount: String(bridgeFloor),
      bridgeFloor: String(bridgeFloor),
    },
  }

  return { session: locked, quote }
}

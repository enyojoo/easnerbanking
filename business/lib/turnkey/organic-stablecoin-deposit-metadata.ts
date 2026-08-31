/** Clears feed-suppression mirror flags when promoting an inbound to a visible organic Stablecoin deposit. */
export function withOrganicStablecoinDepositMetadata(
  metadata: Record<string, unknown>,
): Record<string, unknown> {
  return {
    ...metadata,
    stripe_onramp_chain_mirror: false,
    easetag_p2p_chain_mirror: false,
    grid_va_turnkey_chain_mirror: false,
    noah_bank_onramp_chain_mirror: false,
    yc_fund_balance_chain_mirror: false,
    global_payout_refund_mirror: false,
    suppress_in_feed: false,
  }
}

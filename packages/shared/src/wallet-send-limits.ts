/** Minimum receive amount for direct Turnkey corridors (USDC/Sol, EURC/Sol). */

export const WALLET_SEND_MIN_RECEIVE_AMOUNT = 1

/** LI.FI Allbridge-style bridges reject quotes below ~7 USDC source (Sol→Tron etc.). */
export const LIFI_BRIDGE_MIN_SOURCE_USDC = 7

/**
 * Easner minimum receive amounts for LI.FI wallet-send corridors (stablecoin units).
 * Applied as max(lifiMin, businessMin) — same pattern as fiat payout mins.
 */
const WALLET_SEND_BUSINESS_MIN: Record<string, number> = {
  USDC: 10,
  USDT: 10,
  EURC: 10,
}

function normalizeWalletAsset(asset: string): string {
  return String(asset || '').trim().toUpperCase()
}

export function isDirectTurnkeyWalletCorridor(
  receiveAsset: string,
  receiveNetwork: string,
): boolean {
  const asset = normalizeWalletAsset(receiveAsset)
  const network = String(receiveNetwork || '').trim()
  return (asset === 'USDC' && network === 'Solana') || (asset === 'EURC' && network === 'Solana')
}

/** Product minimum for a wallet receive asset, or null when no policy is defined. */
export function getBusinessWalletSendMin(receiveAsset: string): number | null {
  const asset = normalizeWalletAsset(receiveAsset)
  if (!asset) return null
  return WALLET_SEND_BUSINESS_MIN[asset] ?? null
}

export function minReceiveForLifiBridge(
  customerRate: number,
  minSourceUsdc = LIFI_BRIDGE_MIN_SOURCE_USDC,
): number {
  const rate = customerRate > 0 ? customerRate : 1
  return Math.ceil((minSourceUsdc / rate) * 100) / 100
}

/** Effective wallet receive min: direct Turnkey floor, or max(LI.FI bridge floor, Easner business min). */
export function resolveEffectiveWalletSendMin(input: {
  receiveCurrency: string
  receiveNetwork: string
  customerRate: number
  minSourceUsdc?: number
}): number {
  if (isDirectTurnkeyWalletCorridor(input.receiveCurrency, input.receiveNetwork)) {
    return WALLET_SEND_MIN_RECEIVE_AMOUNT
  }
  const lifiMin = minReceiveForLifiBridge(
    input.customerRate,
    input.minSourceUsdc ?? LIFI_BRIDGE_MIN_SOURCE_USDC,
  )
  const business = getBusinessWalletSendMin(input.receiveCurrency) ?? 0
  const effective = Math.max(lifiMin, business)
  return effective > 0 ? effective : WALLET_SEND_MIN_RECEIVE_AMOUNT
}

export function isWalletSendRecipient(recipient: {
  wallet_network?: string | null
}): boolean {
  return Boolean(String(recipient.wallet_network ?? '').trim())
}

export function validateWalletSendReceiveAmount(
  amount: number,
  receiveCurrency?: string,
  options?: { minReceive?: number },
): { ok: true } | { ok: false; message: string } {
  const min = options?.minReceive ?? WALLET_SEND_MIN_RECEIVE_AMOUNT
  if (!Number.isFinite(amount) || amount < min) {
    const cur = String(receiveCurrency ?? '').trim().toUpperCase()
    const suffix = cur ? ` ${cur}` : ''
    return {
      ok: false,
      message: `Minimum send amount is ${min}${suffix}.`,
    }
  }
  return { ok: true }
}

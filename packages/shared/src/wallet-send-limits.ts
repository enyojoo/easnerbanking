/** Minimum receive amount for balance-funded crypto wallet sends (1 unit of receive asset). */

export const WALLET_SEND_MIN_RECEIVE_AMOUNT = 1

export function isWalletSendRecipient(recipient: {
  wallet_network?: string | null
}): boolean {
  return Boolean(String(recipient.wallet_network ?? '').trim())
}

export function validateWalletSendReceiveAmount(
  amount: number,
  receiveCurrency?: string,
): { ok: true } | { ok: false; message: string } {
  if (!Number.isFinite(amount) || amount < WALLET_SEND_MIN_RECEIVE_AMOUNT) {
    const cur = String(receiveCurrency ?? '').trim().toUpperCase()
    const suffix = cur ? ` ${cur}` : ''
    return {
      ok: false,
      message: `Minimum send amount is ${WALLET_SEND_MIN_RECEIVE_AMOUNT}${suffix}.`,
    }
  }
  return { ok: true }
}

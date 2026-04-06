/** Match `/pay/charge` QR: raw destination address (memo not encoded for EVM stability). */
export function buildAutopayoutQrPayload(depositAddress: string, _depositMemo: string | null): string {
  return depositAddress.trim()
}

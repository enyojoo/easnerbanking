/** When false, client and server skip live corridor catalog (legacy static lists). */
export function isPayoutCorridorsCatalogEnabled(): boolean {
  return process.env.NEXT_PUBLIC_USE_PAYOUT_CORRIDORS !== "false"
}

/** Rows tagged for internal Easetag chain settlement should not appear in public activity lists. */
export function isTurnkeyTransactionHiddenFromFeed(metadata: unknown): boolean {
  if (!metadata || typeof metadata !== "object") return false
  const m = metadata as Record<string, unknown>
  return m.easetag_settlement_leg === true || m.suppress_in_feed === true
}

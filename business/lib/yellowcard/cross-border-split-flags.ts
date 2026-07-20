/** When true, cross-border confirm locks leg2 on review and leg1 on Pay/Continue. */
export function isCrossBorderSplitLockEnabled(): boolean {
  const v = String(process.env.YC_CROSS_BORDER_SPLIT_LOCK || "").trim().toLowerCase()
  if (v === "true" || v === "1") return true
  if (v === "false" || v === "0") return false
  return true
}

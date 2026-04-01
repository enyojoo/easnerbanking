export type StrategyRuntimeConfig = {
  legacyMode: boolean
  shadowMode: boolean
  canaryPercent: number
}

export function getStrategyRuntimeConfig(): StrategyRuntimeConfig {
  const legacyMode = process.env.PRICING_ENGINE_LEGACY_MODE === "true"
  const shadowMode = process.env.PRICING_ENGINE_SHADOW_MODE === "true"
  const canaryPercentRaw = Number(process.env.PRICING_ENGINE_CANARY_PERCENT ?? 100)
  const canaryPercent = Number.isFinite(canaryPercentRaw)
    ? Math.min(100, Math.max(0, canaryPercentRaw))
    : 100
  return {
    legacyMode,
    shadowMode,
    canaryPercent,
  }
}

export function inCanary(userId: string, canaryPercent: number): boolean {
  if (canaryPercent >= 100) return true
  if (canaryPercent <= 0) return false
  let hash = 0
  for (let i = 0; i < userId.length; i++) {
    hash = (hash * 31 + userId.charCodeAt(i)) % 100000
  }
  return hash % 100 < canaryPercent
}

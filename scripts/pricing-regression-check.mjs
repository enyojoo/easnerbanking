#!/usr/bin/env node

/**
 * Deterministic pricing regression checks.
 * Run with: node scripts/pricing-regression-check.mjs
 */

function pickBestRoute(strategyMode, totalFeeAmount, providerCostAmount, candidates) {
  const weighted = candidates.map((c) => {
    const providerCost = Number(c.providerCostAmount ?? providerCostAmount)
    const speed = Number(c.speedScore ?? 0.5)
    const success = Number(c.successScore ?? 0.5)
    const allInPriceScore = 1 / (1 + totalFeeAmount)
    const marginScore = Math.max(0, totalFeeAmount - providerCost)
    const normalizedMargin = marginScore / (1 + providerCost)
    let score = 0
    if (strategyMode === "maximize_margin") {
      score = normalizedMargin * 0.6 + allInPriceScore * 0.1 + speed * 0.15 + success * 0.15
    } else if (strategyMode === "maximize_conversion") {
      score = allInPriceScore * 0.55 + speed * 0.2 + success * 0.2 + normalizedMargin * 0.05
    } else if (strategyMode === "maximize_volume") {
      score = allInPriceScore * 0.4 + success * 0.25 + speed * 0.2 + normalizedMargin * 0.15
    } else {
      score = success * 0.3 + speed * 0.25 + normalizedMargin * 0.25 + allInPriceScore * 0.2
    }
    return { id: c.id, score }
  })
  weighted.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
  return weighted[0]?.id
}

const sampleCandidates = [
  { id: "route-a", providerCostAmount: 1.8, speedScore: 0.7, successScore: 0.95 },
  { id: "route-b", providerCostAmount: 1.2, speedScore: 0.8, successScore: 0.89 },
]

const expected = {
  maximize_margin: "route-b",
  maximize_conversion: "route-b",
  maximize_volume: "route-b",
  strategic_account_pricing: "route-b",
}

for (const mode of Object.keys(expected)) {
  const got = pickBestRoute(mode, 3.2, 1.5, sampleCandidates)
  if (got !== expected[mode]) {
    console.error(`Regression failed for ${mode}: expected ${expected[mode]}, got ${got}`)
    process.exit(1)
  }
}

console.log("Pricing regression checks passed.")

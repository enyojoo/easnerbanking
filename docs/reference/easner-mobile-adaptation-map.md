# Easner mobile — reference → token map (UI v2)

Design research only; Easner keeps **#007ACC** as primary. Sources: public Cash App design language (high contrast, large money type), Revolut-style grouped lists (secondary).

| Reference role | Example (public / common) | Easner token / usage |
|----------------|---------------------------|----------------------|
| Primary brand | Easner blue | `colors.primary.main` `#007ACC` |
| Positive / success accent | Cash-style green ~`#00D632` | `colors.accent.positive` — confirmations, success chips only |
| Canvas | White / near-black | `colors.background.primary`, dark: `resolveThemeColors` |
| Muted surface | Light gray blocks | `colors.frame` / `colors.semantic.muted` |
| Primary action fill | Brand blue | `HapticButton` primary, `BottomButton` |
| Money / balance display | Large tabular figures | `textStyles.balanceDisplay`, `currencyLarge` |
| Motion pulse (skeletons) | Subtle | `motion.skeletonPulseMs` in `theme/motion.ts` |

Tiered data freshness (product): instant shell + profile snapshot (`profileSnapshot.ts`); SWR lists (`userCache.ts` TTLs); balances disk SWR (`BalanceContext`).

/**
 * Motion tokens – keep in sync with `duration` in `./index.ts` where they overlap
 * (same numeric values; this module must not import `index.ts` to avoid cycles).
 */
export const motion = {
  skeletonPulseMs: 1300,
  /** Bottom sheets / large surfaces */
  sheetMs: 250,
  /** Micro-interactions */
  tapMs: 120,
  /** Screen header + body parallel enter */
  screenEnterMs: 200,
  /** List row entrance (no stagger cap) */
  listRowEnterMs: 180,
  /** Legacy alias */
  sheet: 250,
  tap: 120,
  easeOut: 'ease-out' as const,
  /** Subtle translate for screen enter interpolations (px) */
  screenEnterTranslateY: 12,
  listRowTranslateY: 10,
} as const

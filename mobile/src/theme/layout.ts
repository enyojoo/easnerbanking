/**
 * Layout tokens — 8pt grid, screen rhythm (Easner mobile UI v2).
 * Values mirror `spacing` scale (5=20, 6=24) without importing `theme/index` (cycles).
 */
export const layout = {
  screenHorizontal: 20,
  sectionGap: 24,
  listRowMinHeight: 56,
  cardPadding: 20,
  primaryButtonMinHeight: 56,
  /** Bottom tabs: icon + label + padding (content only; safe area added in navigator). */
  tabBarHeight: 72,
} as const

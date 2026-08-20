/**
 * Easner Design System – Source of Truth
 *
 * Shared design tokens consumed by:
 *   - business/ (Next.js + Tailwind v4 + shadcn)
 *   - office/   (Next.js + Tailwind v4 + shadcn)
 *   - mobile/   (Expo + React Navigation + StyleSheet)
 *
 * Brand positioning: modern private banking for global operators.
 * Palette: Graphite + Ivory + Easner blue primary (#007ACC); hover #0062A3; deep navy
 * (#0A2540); sparse light tint (#EAF5FD); dark-mode accent (#3AA6F8). Emerald for success.
 *
 * CSS variables on web are derived from the `hsl` tuples below.
 * Mobile palettes live in `mobile/src/theme/colors.ts` and are kept
 * structurally in sync with `lightSemantic` / `darkSemantic` here.
 */

/* ------------------------------------------------------------------ *
 *  1. Raw brand palette
 * ------------------------------------------------------------------ */

export const easnerBrand = {
  graphite: "#0F1110",
  carbon: "#151817",
  ink: "#1C201E",
  ivory: "#F6F3EB",
  cloud: "#F8F6F0",
  mist: "#E9E4D8",
  stone: "#D9D4C7",
  slate: "#6F756F",
  /** UI primary – links, buttons, focus ring, charts series 1 */
  primary: "#007ACC",
  /** Hover for primary controls (pairs with primary) */
  primaryHover: "#0062A3",
  /** Pressed / deep end of primary ramp (darker than hover) */
  primaryDeep: "#005A9E",
  /** Executive contrast – hero, marketing, institutional strips (not default body text) */
  navy: "#0A2540",
  /** Sparse cool highlight – selected rows, info callouts (not full-screen wash) */
  tintBlue: "#EAF5FD",
  /** Dark canvas primary accent – links, CTAs, ring on graphite */
  darkAccent: "#3AA6F8",
  /** Dark-mode primary control hover / pressed (pairs with darkAccent) */
  darkPrimaryHover: "#2B8FDC",
  emerald: "#0F8A5F",
  emeraldDeep: "#0A6E4C",
  amber: "#A8792A",
  oxblood: "#7A2E2E",
} as const

export type EasnerBrand = typeof easnerBrand

/* ------------------------------------------------------------------ *
 *  2. HSL tuples – used verbatim inside CSS variables on web.
 *     Format is "H S% L%" (no `hsl(...)` wrapper) so Tailwind
 *     modifiers like `bg-primary/10` keep working.
 * ------------------------------------------------------------------ */

export const hsl = {
  /** Blue-gray neutrals (~210°) – avoids 120° green cast in dark UI next to emerald success */
  graphite: "210 11% 8%",
  carbon: "210 10% 10%",
  ink: "210 12% 12%",
  ivory: "42 33% 95%",
  cloud: "42 38% 97%",
  mist: "42 33% 88%",
  stone: "40 27% 82%",
  slate: "210 5% 45%",
  /** #007ACC */
  primary: "204 100% 40%",
  /** #0062A3 */
  primaryHover: "204 100% 32%",
  /** #005A9E */
  primaryDeep: "206 100% 31%",
  /** #0A2540 */
  navy: "210 73% 15%",
  /** #EAF5FD */
  tintBlue: "205 83% 96%",
  /** #3AA6F8 – dark-mode primary / ring / chart-1 on graphite */
  darkAccent: "206 93% 60%",
  /** #2B8FDC */
  darkPrimaryHover: "206 72% 52%",
  emerald: "156 80% 30%",
  emeraldDeep: "156 83% 24%",
  amber: "37 61% 41%",
  oxblood: "0 45% 33%",
} as const

/* ------------------------------------------------------------------ *
 *  3. Semantic role maps (light + dark)
 * ------------------------------------------------------------------ */

export const lightSemantic = {
  background: "42 33% 95%",
  foreground: "210 12% 8%",

  card: "40 27% 97%",
  cardForeground: "210 12% 8%",

  popover: "40 27% 97%",
  popoverForeground: "210 12% 8%",

  primary: "204 100% 40%",
  primaryForeground: "40 30% 96%",

  secondary: "42 18% 88%",
  secondaryForeground: "210 12% 8%",

  muted: "42 20% 90%",
  mutedForeground: "210 7% 42%",

  // Subtle neutral hover surface (shadcn menu/select items, hover:bg-accent).
  // Kept quiet so text-foreground stays legible. Primary blue is separate;
  // emerald is reserved for success, not here.
  accent: "42 20% 90%",
  accentForeground: "210 12% 8%",

  destructive: "0 45% 33%",
  destructiveForeground: "40 30% 96%",

  warning: "37 61% 41%",
  warningForeground: "40 30% 96%",

  success: "156 80% 30%",
  successForeground: "40 30% 96%",

  border: "40 18% 82%",
  input: "40 18% 82%",
  ring: "204 100% 40%",

  sidebar: "40 27% 97%",
  sidebarForeground: "210 12% 8%",

  chart1: "204 100% 40%",
  chart2: "210 12% 8%",
  chart3: "40 27% 82%",
  chart4: "37 61% 41%",
  chart5: "210 5% 45%",

  /** Optional surfaces – wire to CSS `--primary-hover`, `--surface-tint`, `--brand-navy` */
  primaryHover: "204 100% 32%",
  surfaceTint: "205 83% 96%",
  brandNavy: "210 73% 15%",
} as const

export const darkSemantic = {
  background: "210 10% 8%",
  foreground: "40 24% 93%",

  card: "210 10% 11%",
  cardForeground: "40 24% 93%",

  popover: "210 10% 11%",
  popoverForeground: "40 24% 93%",

  /* Dark canvas accent – #3AA6F8 (readable on graphite; not a flat blue wash) */
  primary: "206 93% 60%",
  primaryForeground: "40 30% 96%",

  secondary: "210 8% 15%",
  secondaryForeground: "40 24% 93%",

  muted: "210 7% 16%",
  mutedForeground: "40 10% 70%",

  // Quiet neutral hover surface (dark). See lightSemantic.accent note.
  accent: "210 7% 16%",
  accentForeground: "40 24% 93%",

  destructive: "0 40% 35%",
  destructiveForeground: "40 30% 96%",

  warning: "37 55% 48%",
  warningForeground: "40 30% 96%",

  success: "156 80% 34%",
  successForeground: "40 30% 96%",

  border: "210 7% 18%",
  input: "210 7% 18%",
  ring: "206 93% 60%",

  sidebar: "210 10% 10%",
  sidebarForeground: "40 24% 93%",

  chart1: "206 93% 60%",
  chart2: "40 24% 93%",
  chart3: "210 10% 28%",
  chart4: "37 55% 48%",
  chart5: "210 5% 55%",

  /** Dark primary control hover – matches `--primary-hover` in `.dark` */
  primaryHover: "206 93% 52%",
  /** Sparse cool highlight on dark canvas */
  surfaceTint: "206 40% 18%",
  brandNavy: "210 73% 15%",
} as const

export type Semantic = typeof lightSemantic

/* ------------------------------------------------------------------ *
 *  4. Spacing (4px grid, premium rhythm)
 * ------------------------------------------------------------------ */

export const spacing = {
  0: 0,
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  8: 32,
  10: 40,
  12: 48,
  16: 64,
  20: 80,
} as const

/* ------------------------------------------------------------------ *
 *  5. Radius scale (modern, soft, never toy-like)
 * ------------------------------------------------------------------ */

export const radius = {
  none: 0,
  xs: 6,
  sm: 10,
  md: 16,
  lg: 22,
  xl: 28,
  full: 9999,
} as const

/* ------------------------------------------------------------------ *
 *  6. Shadows – soft layered, graphite-based. No glows, no colored.
 * ------------------------------------------------------------------ */

export const shadowCss = {
  soft: "0 8px 30px rgba(15, 17, 16, 0.06)",
  card: "0 10px 30px rgba(15, 17, 16, 0.08)",
  lift: "0 16px 40px rgba(15, 17, 16, 0.12)",
  inset: "inset 0 1px 0 rgba(246, 243, 235, 0.06)",
} as const

/* ------------------------------------------------------------------ *
 *  7. Typography
 * ------------------------------------------------------------------ */

export const fontFamilies = {
  sans: ["Geist", "Inter", "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
  mono: ["Geist Mono", "ui-monospace", "SFMono-Regular", "monospace"],
  serif: ["Playfair Display", "Cormorant Garamond", "ui-serif", "serif"],
} as const

export const typeScale = {
  displayXl: { size: 56, line: 64 },
  displayLg: { size: 44, line: 52 },
  h1: { size: 36, line: 44 },
  h2: { size: 30, line: 38 },
  h3: { size: 24, line: 32 },
  h4: { size: 20, line: 28 },
  bodyLg: { size: 18, line: 28 },
  body: { size: 16, line: 24 },
  bodySm: { size: 14, line: 22 },
  caption: { size: 12, line: 18 },
} as const

/* ------------------------------------------------------------------ *
 *  8. Motion
 * ------------------------------------------------------------------ */

export const motion = {
  durations: {
    instant: 0,
    fast: 150,
    normal: 220,
    slow: 320,
    slower: 480,
  },
  easings: {
    standard: "cubic-bezier(0.2, 0.6, 0.2, 1)",
    enter: "cubic-bezier(0, 0, 0.2, 1)",
    exit: "cubic-bezier(0.4, 0, 1, 1)",
  },
} as const

/* ------------------------------------------------------------------ *
 *  9. Z-index
 * ------------------------------------------------------------------ */

export const zIndex = {
  base: 0,
  dropdown: 10,
  sticky: 20,
  fixed: 30,
  overlay: 40,
  modal: 50,
  popover: 60,
  toast: 70,
} as const

export const designTokens = {
  brand: easnerBrand,
  hsl,
  light: lightSemantic,
  dark: darkSemantic,
  spacing,
  radius,
  shadowCss,
  fontFamilies,
  typeScale,
  motion,
  zIndex,
} as const

export type DesignTokens = typeof designTokens

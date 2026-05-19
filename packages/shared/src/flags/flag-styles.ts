/**
 * Flag display follows country-flag-icons convention: 3:2 width:height, full flag visible (contain).
 * @see https://www.npmjs.com/package/country-flag-icons
 */

/** Subtle corner radius on flag frame (not pill-shaped). */
export const FLAG_BORDER_RADIUS_PX = 2

/** ISO-style flag proportion (width : height = 3 : 2). */
export const FLAG_ASPECT_WIDTH = 3
export const FLAG_ASPECT_HEIGHT = 2

/** `size` prop is flag width in px; height is derived from 3:2. */
export function flagHeightForWidth(width: number): number {
  return Math.max(1, Math.round((width * FLAG_ASPECT_HEIGHT) / FLAG_ASPECT_WIDTH))
}

export function flagWidthForHeight(height: number): number {
  return Math.max(1, Math.round((height * FLAG_ASPECT_WIDTH) / FLAG_ASPECT_HEIGHT))
}

/** Web: decorative flag (no img context menu / drag). */
export const FLAG_WEB_DECORATIVE_CLASS =
  "inline-block shrink-0 overflow-hidden select-none bg-contain bg-center bg-no-repeat [pointer-events:none] [-webkit-user-drag:none] [-webkit-touch-callout:none]"

/** Letterbox areas when PNG aspect ≠ 3:2 (subtle, matches UI chrome). */
export const FLAG_FRAME_BG_CLASS = "bg-muted/30"

/** Use on web when the parent sets width/height (e.g. avatar badge). */
export const FLAG_FILL_CLASS = "size-full min-h-0 min-w-0"

/** Tailwind aspect ratio for 3:2 badge shells. */
export const FLAG_ASPECT_CLASS = "aspect-[3/2]"

export type FlagBoxSize = { width: number; height: number }

function parseCssPixel(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string") {
    const n = Number.parseInt(value, 10)
    if (Number.isFinite(n)) return n
  }
  return undefined
}

export function resolveFlagBoxSize(
  size: number | string | undefined,
  overrides?: Partial<FlagBoxSize>
): FlagBoxSize {
  const base = typeof size === "number" ? size : Number.parseInt(String(size), 10) || 24
  const width = overrides?.width ?? base
  const height = overrides?.height ?? flagHeightForWidth(width)
  return { width, height }
}

export function resolveFlagBoxSizeFromStyle(
  size: number | string | undefined,
  style?: { width?: unknown; height?: unknown }
): FlagBoxSize {
  const w = parseCssPixel(style?.width)
  const h = parseCssPixel(style?.height)
  if (w != null && h != null) return { width: w, height: h }
  if (w != null) return { width: w, height: flagHeightForWidth(w) }
  if (h != null) return { width: flagWidthForHeight(h), height: h }
  return resolveFlagBoxSize(size)
}

export function flagFillsParentClass(className?: string): boolean {
  return Boolean(className && /\b(size-full|h-full|w-full)\b/.test(className))
}

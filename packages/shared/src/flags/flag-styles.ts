/** Subtle corner radius on bundled flag PNGs (3:4), not pill-shaped. */
export const FLAG_BORDER_RADIUS_PX = 2

/** Web: decorative flag (no img context menu / drag). */
export const FLAG_WEB_DECORATIVE_CLASS =
  "inline-block shrink-0 overflow-hidden select-none bg-cover bg-center bg-no-repeat [pointer-events:none] [-webkit-user-drag:none] [-webkit-touch-callout:none]"

/** Use on web when the parent sets width/height (e.g. avatar badge). */
export const FLAG_FILL_CLASS = "size-full min-h-0 min-w-0"

export type FlagBoxSize = { width: number; height: number }

function parseCssPixel(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string") {
    const n = Number.parseInt(value, 10)
    if (Number.isFinite(n)) return n
  }
  return undefined
}

/** Square box by default so cover-fill has no letterboxing in square UI slots. */
export function resolveFlagBoxSize(
  size: number | string | undefined,
  overrides?: Partial<FlagBoxSize>
): FlagBoxSize {
  const base = typeof size === "number" ? size : Number.parseInt(String(size), 10) || 24
  const width = overrides?.width ?? base
  const height = overrides?.height ?? width
  return { width, height }
}

export function resolveFlagBoxSizeFromStyle(
  size: number | string | undefined,
  style?: { width?: unknown; height?: unknown }
): FlagBoxSize {
  const w = parseCssPixel(style?.width)
  const h = parseCssPixel(style?.height)
  if (w != null || h != null) {
    const side = w ?? h ?? (typeof size === "number" ? size : Number.parseInt(String(size), 10) || 24)
    return { width: w ?? side, height: h ?? side }
  }
  return resolveFlagBoxSize(size)
}

export function flagFillsParentClass(className?: string): boolean {
  return Boolean(className && /\b(size-full|h-full|w-full)\b/.test(className))
}

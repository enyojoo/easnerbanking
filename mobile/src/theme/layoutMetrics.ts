/**
 * Responsive layout metrics for mobile + regular-width surfaces.
 */
export const CONTENT_MAX_WIDTH = 428
export const REGULAR_WIDTH_BREAKPOINT = 600
export const TABLET_MAX_WIDTH = 480
export const DESKTOP_MIN_WIDTH = 1024
export const SIDEBAR_WIDTH = 256
export const HEADER_HEIGHT = 64
export const CONTENT_MAX_WIDTH_DESKTOP = 1440
export const CONTENT_MAX_WIDTH_OVERVIEW = 1152

export type LayoutMode = 'mobile' | 'tablet' | 'desktop'

export function getLayoutMode(width: number): LayoutMode {
  if (width >= DESKTOP_MIN_WIDTH) return 'desktop'
  if (width >= REGULAR_WIDTH_BREAKPOINT) return 'tablet'
  return 'mobile'
}

type KeypadSizeOptions = {
  columns?: number
  gap?: number
  minSize?: number
  maxSize?: number
}

export function getContentWidth(windowWidth: number, horizontalInset: number): number {
  const usable = Math.max(0, windowWidth - horizontalInset * 2)
  return Math.min(usable, CONTENT_MAX_WIDTH)
}

export function isRegularWidth(windowWidth: number): boolean {
  return windowWidth >= REGULAR_WIDTH_BREAKPOINT
}

export function computeKeypadCellSize(
  contentWidth: number,
  options: KeypadSizeOptions = {},
): { buttonWidth: number; rowWidth: number; gap: number; columns: number } {
  const columns = options.columns ?? 3
  const gap = options.gap ?? 8
  const minSize = options.minSize ?? 68
  const maxSize = options.maxSize ?? 114
  const totalGaps = (columns - 1) * gap
  const raw = Math.floor((contentWidth - totalGaps) / columns)
  const buttonWidth = Math.max(minSize, Math.min(maxSize, raw))
  const rowWidth = (buttonWidth * columns) + totalGaps
  return { buttonWidth, rowWidth, gap, columns }
}

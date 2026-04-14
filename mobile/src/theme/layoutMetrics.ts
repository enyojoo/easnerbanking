/**
 * Responsive layout metrics for mobile + regular-width surfaces.
 */
export const CONTENT_MAX_WIDTH = 428
export const REGULAR_WIDTH_BREAKPOINT = 600

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

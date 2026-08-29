import type { StatementActivityPdfRow } from "./types"

/** Page 1 keeps room for period, account, and summary — same split as the canvas. */
export const PAGE1_ACTIVITY_ROWS = 16
export const CONTINUATION_ACTIVITY_ROWS = 28

export function chunkStatementActivityPages(
  lines: StatementActivityPdfRow[],
): StatementActivityPdfRow[][] {
  if (lines.length === 0) return [[]]
  const pages: StatementActivityPdfRow[][] = [lines.slice(0, PAGE1_ACTIVITY_ROWS)]
  for (let i = PAGE1_ACTIVITY_ROWS; i < lines.length; i += CONTINUATION_ACTIVITY_ROWS) {
    pages.push(lines.slice(i, i + CONTINUATION_ACTIVITY_ROWS))
  }
  return pages
}

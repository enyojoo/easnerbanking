/**
 * Shared date grouping for transaction lists (Activity / Dashboard parity).
 */

export type GroupableTransactionRow = {
  noah_created_at?: string
  created_at?: string
}

export type GroupedListItem<T extends GroupableTransactionRow> =
  | { kind: 'header'; key: string; label: string }
  | { kind: 'group'; key: string; rows: T[] }

function dayKeyFromDate(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
}

function formatDayHeader(d: Date): string {
  const today = new Date()
  const yesterday = new Date()
  yesterday.setDate(today.getDate() - 1)
  if (dayKeyFromDate(d) === dayKeyFromDate(today)) return 'Today'
  if (dayKeyFromDate(d) === dayKeyFromDate(yesterday)) return 'Yesterday'
  const month = d.toLocaleString('en-US', { month: 'short' })
  return `${month} ${d.getDate()}, ${d.getFullYear()}`.toUpperCase()
}

export function buildGroupedActivityItems<T extends GroupableTransactionRow>(
  rows: T[],
): GroupedListItem<T>[] {
  if (rows.length === 0) return []
  const items: GroupedListItem<T>[] = []
  const groupedRows: Array<{ rows: T[]; key: string; label: string }> = []
  for (const tx of rows) {
    const date = new Date(tx.noah_created_at || tx.created_at)
    const key = dayKeyFromDate(date)
    const last = groupedRows[groupedRows.length - 1]
    if (last && last.key === key) {
      last.rows.push(tx)
    } else {
      groupedRows.push({ key, label: formatDayHeader(date), rows: [tx] })
    }
  }
  for (const group of groupedRows) {
    items.push({ kind: 'header', key: `h-${group.key}`, label: group.label })
    items.push({ kind: 'group', key: `g-${group.key}`, rows: group.rows })
  }
  return items
}

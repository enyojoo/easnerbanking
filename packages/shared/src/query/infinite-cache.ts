import type { InfiniteData, QueryClient, QueryKey } from "@tanstack/react-query"

export type InfinitePages<TPage> = InfiniteData<TPage, unknown>

/**
 * Prepend a row into the first page of every matching infinite query under `rootKey`.
 */
export function prependIntoFirstPage<TPage extends { transactions?: unknown[] }>(
  qc: QueryClient,
  rootKey: QueryKey,
  row: NonNullable<TPage["transactions"]>[number],
  idFn: (row: unknown) => string = (r) => String((r as { id?: string }).id ?? ""),
): boolean {
  let patched = false
  const rowId = idFn(row)
  const queries = qc.getQueriesData<InfinitePages<TPage>>({ queryKey: rootKey, exact: false })
  for (const [key, data] of queries) {
    if (!data?.pages?.length) continue
    const first = data.pages[0]
    const txs = [...(first.transactions ?? [])]
    if (txs.some((t) => idFn(t) === rowId)) continue
    const nextPages = [{ ...first, transactions: [row, ...txs] }, ...data.pages.slice(1)]
    qc.setQueryData(key, { ...data, pages: nextPages })
    patched = true
  }
  return patched
}

/**
 * Patch a row by id across all cached infinite pages under `rootKey`.
 */
export function patchRowInPages<TPage extends { transactions?: unknown[] }>(
  qc: QueryClient,
  rootKey: QueryKey,
  rowId: string,
  patchFn: (row: NonNullable<TPage["transactions"]>[number]) => NonNullable<TPage["transactions"]>[number],
  idFn: (row: unknown) => string = (r) => String((r as { id?: string }).id ?? ""),
): boolean {
  let patched = false
  const queries = qc.getQueriesData<InfinitePages<TPage>>({ queryKey: rootKey, exact: false })
  for (const [key, data] of queries) {
    if (!data?.pages?.length) continue
    let changed = false
    const pages = data.pages.map((page) => {
      const txs = page.transactions ?? []
      const next = txs.map((t) => {
        if (idFn(t) !== rowId) return t
        changed = true
        return patchFn(t)
      })
      return changed ? { ...page, transactions: next } : page
    })
    if (changed) {
      qc.setQueryData(key, { ...data, pages })
      patched = true
    }
  }
  return patched
}

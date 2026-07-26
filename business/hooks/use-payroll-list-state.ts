"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"

export function usePayrollListState<Filter extends string>({
  allowedFilters,
  defaultFilter,
  filterParam,
  legacyFilterParam,
}: {
  allowedFilters: readonly Filter[]
  defaultFilter: Filter
  filterParam: string
  legacyFilterParam?: string
}) {
  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const filterFromUrl = useCallback((): Filter => {
    const candidate = searchParams.get(filterParam) || (legacyFilterParam ? searchParams.get(legacyFilterParam) : null)
    return allowedFilters.includes(candidate as Filter) ? (candidate as Filter) : defaultFilter
  }, [allowedFilters, defaultFilter, filterParam, legacyFilterParam, searchParams])

  const [query, setQueryState] = useState(searchParams.get("q") ?? "")
  const [filter, setFilterState] = useState<Filter>(filterFromUrl)

  const replaceParams = useCallback((nextQuery: string, nextFilter: Filter) => {
    const next = new URLSearchParams(searchParams.toString())
    const cleanQuery = nextQuery.trim()
    if (cleanQuery) next.set("q", cleanQuery)
    else next.delete("q")
    if (nextFilter === defaultFilter) next.delete(filterParam)
    else next.set(filterParam, nextFilter)
    if (legacyFilterParam) next.delete(legacyFilterParam)
    const suffix = next.toString()
    router.replace(suffix ? `${pathname}?${suffix}` : pathname, { scroll: false })
  }, [defaultFilter, filterParam, legacyFilterParam, pathname, router, searchParams])

  useEffect(() => {
    setQueryState(searchParams.get("q") ?? "")
    setFilterState(filterFromUrl())
  }, [filterFromUrl, searchParams])

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current)
  }, [])

  function setQuery(value: string) {
    setQueryState(value)
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => replaceParams(value, filter), 220)
  }

  function setFilter(value: Filter) {
    setFilterState(value)
    if (timerRef.current) clearTimeout(timerRef.current)
    replaceParams(query, value)
  }

  const returnToParams = new URLSearchParams(searchParams.toString())
  const cleanQuery = query.trim()
  if (cleanQuery) returnToParams.set("q", cleanQuery)
  else returnToParams.delete("q")
  if (filter === defaultFilter) returnToParams.delete(filterParam)
  else returnToParams.set(filterParam, filter)
  if (legacyFilterParam) returnToParams.delete(legacyFilterParam)
  const returnToQuery = returnToParams.toString()
  const returnTo = returnToQuery ? `${pathname}?${returnToQuery}` : pathname

  return { query, filter, setQuery, setFilter, returnTo }
}

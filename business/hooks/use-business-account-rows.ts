"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { fetchWithSession } from "@/lib/fetch-with-session"
import { useAuth } from "@/lib/auth-context"
import { useBusinessProfile } from "@/lib/use-business-profile"
import type { Account } from "@/lib/finance-types"
import {
  businessNoahAccountsPersistKey,
  CACHE_KEYS,
  dataCache,
} from "@/lib/cache"

type VaJson = {
  hasAccount?: boolean
  currency?: string
  accountNumber?: string
  routingNumber?: string
  sortCode?: string
  iban?: string
  bic?: string
  bankName?: string
  bankAddress?: string
  accountHolderName?: string
}

type AccountSnapshot = {
  balances: { USD: string; EUR: string }
  enabledExtras: string[]
  /** Turnkey Solana receive addresses (USDC → USD bucket, EURC → EUR bucket). */
  stablecoinDeposit: { USD: string; EUR: string }
  vaByCurrency: Record<string, VaJson | null>
}

const SNAPSHOT_TTL_MS = 2 * 60 * 1000
const BALANCE_POLL_MS = 45 * 1000

function maskTail(s: string | undefined, visible = 4): string {
  if (!s) return "—"
  const t = s.replace(/\s/g, "")
  if (t.length <= visible) return t
  return `••••${t.slice(-visible)}`
}

export function parseBalanceString(bal: string | undefined): number {
  const n = parseFloat(String(bal ?? "0").replace(/,/g, ""))
  return Number.isFinite(n) ? n : 0
}

function isAccountSnapshot(v: unknown): v is AccountSnapshot {
  if (!v || typeof v !== "object") return false
  const o = v as Record<string, unknown>
  const b = o.balances
  if (!b || typeof b !== "object") return false
  const bb = b as Record<string, unknown>
  const sd = o.stablecoinDeposit
  if (!sd || typeof sd !== "object") return false
  const sdd = sd as Record<string, unknown>
  return (
    typeof bb.USD === "string" &&
    typeof bb.EUR === "string" &&
    typeof sdd.USD === "string" &&
    typeof sdd.EUR === "string"
  )
}

function readSnapshotFromLocalStorage(userId: string): AccountSnapshot | null {
  try {
    const raw = localStorage.getItem(businessNoahAccountsPersistKey(userId))
    if (!raw) return null
    const wrap = JSON.parse(raw) as { data?: unknown }
    return isAccountSnapshot(wrap.data) ? wrap.data : null
  } catch {
    return null
  }
}

function persistSnapshot(userId: string, snapshot: AccountSnapshot) {
  const key = CACHE_KEYS.BUSINESS_NOAH_ACCOUNT_SNAPSHOT(userId)
  dataCache.set(key, snapshot, SNAPSHOT_TTL_MS)
  try {
    localStorage.setItem(
      businessNoahAccountsPersistKey(userId),
      JSON.stringify({ data: snapshot, timestamp: Date.now() }),
    )
  } catch {
    /* ignore quota */
  }
}

function applySnapshotToSetter(
  snapshot: AccountSnapshot,
  setBalances: (b: { USD: string; EUR: string }) => void,
  setEnabledExtras: (e: string[]) => void,
  setStablecoinDeposit: (s: { USD: string; EUR: string }) => void,
  setVaByCurrency: (v: Record<string, VaJson | null>) => void,
) {
  setBalances(snapshot.balances)
  setEnabledExtras(snapshot.enabledExtras)
  setStablecoinDeposit(snapshot.stablecoinDeposit)
  setVaByCurrency(snapshot.vaByCurrency)
}

export function useBusinessAccountRows() {
  const { user } = useAuth()
  const userId = user?.id ?? null
  const { tier1Complete, isLoading: profileLoading, name, baseCurrency } = useBusinessProfile()
  const [balances, setBalances] = useState<{ USD: string; EUR: string }>({ USD: "0", EUR: "0" })
  const [enabledExtras, setEnabledExtras] = useState<string[]>([])
  const [stablecoinDeposit, setStablecoinDeposit] = useState<{ USD: string; EUR: string }>({
    USD: "",
    EUR: "",
  })
  const [vaByCurrency, setVaByCurrency] = useState<Record<string, VaJson | null>>({})
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const hasFetchedOnceRef = useRef(false)
  const restoredFromCacheRef = useRef(false)
  /** Avoid re-applying disk snapshot on every profile refetch (would stomp fresher polled balances). */
  const diskHydrateDoneForTierRef = useRef(false)
  const balancesRef = useRef(balances)
  const enabledExtrasRef = useRef(enabledExtras)
  const stablecoinDepositRef = useRef(stablecoinDeposit)
  const vaByCurrencyRef = useRef(vaByCurrency)
  balancesRef.current = balances
  enabledExtrasRef.current = enabledExtras
  stablecoinDepositRef.current = stablecoinDeposit
  vaByCurrencyRef.current = vaByCurrency

  const noahHeaders = useMemo(
    () => ({
      "X-Easner-Noah-Scope": "business",
    }),
    [],
  )

  /** Restore from memory / localStorage once per Tier-1 session so first paint has balances. */
  useEffect(() => {
    if (!userId || profileLoading || !tier1Complete || diskHydrateDoneForTierRef.current) return
    const key = CACHE_KEYS.BUSINESS_NOAH_ACCOUNT_SNAPSHOT(userId)
    const mem = dataCache.get<AccountSnapshot>(key)
    const snap =
      mem && isAccountSnapshot(mem) ? mem : readSnapshotFromLocalStorage(userId)
    diskHydrateDoneForTierRef.current = true
    if (!snap) return
    applySnapshotToSetter(snap, setBalances, setEnabledExtras, setStablecoinDeposit, setVaByCurrency)
    dataCache.set(key, snap, SNAPSHOT_TTL_MS)
    restoredFromCacheRef.current = true
    hasFetchedOnceRef.current = true
    setLoading(false)
  }, [userId, profileLoading, tier1Complete])

  useEffect(() => {
    if (!tier1Complete) {
      hasFetchedOnceRef.current = false
      restoredFromCacheRef.current = false
      diskHydrateDoneForTierRef.current = false
    }
  }, [tier1Complete])

  const refreshAccounts = useCallback(async () => {
    setLoadError(null)
    if (!userId) {
      setLoading(false)
      return
    }

    if (!tier1Complete) {
      setBalances({ USD: "0", EUR: "0" })
      setEnabledExtras([])
      setStablecoinDeposit({ USD: "", EUR: "" })
      setVaByCurrency({})
      hasFetchedOnceRef.current = false
      restoredFromCacheRef.current = false
      setLoading(false)
      return
    }

    const silent =
      hasFetchedOnceRef.current || restoredFromCacheRef.current
    if (!silent) {
      setLoading(true)
    }
    restoredFromCacheRef.current = false

    try {
      const [availRes, tkBalRes, depositRes] = await Promise.all([
        fetchWithSession("/api/accounts/available-currencies", { headers: noahHeaders }),
        fetchWithSession("/api/wallets/on-chain-balances", { headers: noahHeaders }),
        fetchWithSession("/api/wallets/deposit-addresses", { headers: noahHeaders }),
      ])

      const avail = (await availRes.json().catch(() => ({}))) as {
        enabledExtras?: string[]
        error?: string
      }
      let nextExtras = enabledExtrasRef.current
      if (availRes.ok) {
        nextExtras = (avail.enabledExtras ?? []).map((c) => c.toUpperCase())
        setEnabledExtras(nextExtras)
      }

      let nextBalances: { USD: string; EUR: string }
      if (tkBalRes.ok) {
        const t = (await tkBalRes.json().catch(() => ({}))) as {
          USD?: string
          EUR?: string
        }
        const hasUSD = Object.prototype.hasOwnProperty.call(t ?? {}, "USD")
        const hasEUR = Object.prototype.hasOwnProperty.call(t ?? {}, "EUR")
        const prev = balancesRef.current
        nextBalances = {
          USD: hasUSD ? (typeof t.USD === "string" ? t.USD : "0") : prev.USD,
          EUR: hasEUR ? (typeof t.EUR === "string" ? t.EUR : "0") : prev.EUR,
        }
      } else {
        // Keep last known balances if refresh fails to avoid transient 0.00 flicker.
        nextBalances = balancesRef.current
      }
      setBalances(nextBalances)

      let nextDeposit = stablecoinDepositRef.current
      if (depositRes.ok) {
        const d = (await depositRes.json()) as {
          USD?: { address?: string }
          EUR?: { address?: string }
        }
        nextDeposit = {
          USD: typeof d.USD?.address === "string" ? d.USD.address : "",
          EUR: typeof d.EUR?.address === "string" ? d.EUR.address : "",
        }
        setStablecoinDeposit(nextDeposit)
      }

      const extras = nextExtras
      const codes = ["USD", "EUR", ...extras.filter((c) => c !== "USD" && c !== "EUR")]

      const vaEntries: Record<string, VaJson | null> = {}
      await Promise.all(
        codes.map(async (code) => {
          const cur = code.toLowerCase()
          if (cur !== "usd" && cur !== "eur" && cur !== "gbp") {
            vaEntries[code] = null
            return
          }
          const r = await fetchWithSession(`/api/noah/virtual-accounts?currency=${cur}`, {
            headers: noahHeaders,
          })
          if (!r.ok) {
            vaEntries[code] = null
            return
          }
          vaEntries[code] = (await r.json()) as VaJson
        }),
      )
      setVaByCurrency(vaEntries)

      hasFetchedOnceRef.current = true
      persistSnapshot(userId, {
        balances: nextBalances,
        enabledExtras: nextExtras,
        stablecoinDeposit: nextDeposit,
        vaByCurrency: vaEntries,
      })
    } catch (e: unknown) {
      setLoadError(e instanceof Error ? e.message : "Could not load accounts.")
    } finally {
      setLoading(false)
      hasFetchedOnceRef.current = true
    }
  }, [noahHeaders, tier1Complete, userId])

  useEffect(() => {
    if (profileLoading) return
    void refreshAccounts()
  }, [profileLoading, refreshAccounts])

  useEffect(() => {
    if (!userId || !tier1Complete || profileLoading) return
    const id = window.setInterval(() => {
      void refreshAccounts()
    }, BALANCE_POLL_MS)
    return () => window.clearInterval(id)
  }, [userId, tier1Complete, profileLoading, refreshAccounts])

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "visible" && tier1Complete && userId && !profileLoading) {
        void refreshAccounts()
      }
    }
    document.addEventListener("visibilitychange", onVis)
    return () => document.removeEventListener("visibilitychange", onVis)
  }, [profileLoading, refreshAccounts, tier1Complete, userId])

  useEffect(() => {
    const onRefresh = () => {
      void refreshAccounts()
    }
    window.addEventListener("easner-business-accounts-refresh", onRefresh)
    return () => window.removeEventListener("easner-business-accounts-refresh", onRefresh)
  }, [refreshAccounts])

  const displayName = name?.trim() || "Business"

  const accountRows: Account[] = useMemo(() => {
    const extras = enabledExtras.filter((c) => c !== "USD" && c !== "EUR")
    const codes = ["USD", "EUR", ...extras] as Account["currency"][]
    return codes.map((currency) => {
      const va = vaByCurrency[currency]
      const bal =
        currency === "USD"
          ? parseBalanceString(balances.USD)
          : currency === "EUR"
            ? parseBalanceString(balances.EUR)
            : 0

      const hasVa = Boolean(va?.hasAccount)
      const usdc = currency === "USD" || currency === "GBP"
      const eurc = currency === "EUR"
      const stablecoinAddress =
        currency === "EUR"
          ? stablecoinDeposit.EUR || undefined
          : stablecoinDeposit.USD || undefined

      return {
        id: `acc_${currency.toLowerCase()}`,
        currency,
        accountName: hasVa ? va?.accountHolderName || displayName : displayName,
        bankName: hasVa ? va?.bankName || "—" : "—",
        accountNumber: hasVa ? maskTail(va?.accountNumber ?? va?.iban) : "—",
        fullAccountNumber: hasVa ? va?.accountNumber ?? va?.iban ?? "" : "",
        routingNumber: currency === "USD" ? va?.routingNumber : undefined,
        sortCode: currency === "GBP" ? va?.sortCode ?? va?.routingNumber : undefined,
        iban: currency === "EUR" ? va?.iban : undefined,
        bic: currency === "EUR" ? va?.bic : undefined,
        bankAddress: va?.bankAddress,
        balance: bal,
        availableBalance: bal,
        status: tier1Complete ? "active" : "pending",
        stablecoinAddress,
        stablecoinChain: "Solana",
        stablecoinToken: usdc ? "USDC" : eurc ? "EURC" : "USDC",
      }
    })
  }, [balances, displayName, enabledExtras, stablecoinDeposit, tier1Complete, vaByCurrency])

  return {
    accountRows,
    loading,
    loadError,
    tier1Complete,
    profileLoading,
    refreshAccounts,
    noahHeaders,
    displayName,
    balances,
    baseCurrency: baseCurrency?.toUpperCase() || "USD",
  }
}
"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { fetchWithSession } from "@/lib/fetch-with-session"
import { useBusinessProfile } from "@/lib/use-business-profile"
import type { Account } from "@/lib/finance-types"

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

export function useBusinessAccountRows() {
  const { tier1Complete, isLoading: profileLoading, name, baseCurrency } = useBusinessProfile()
  const [balances, setBalances] = useState<{ USD: string; EUR: string }>({ USD: "0", EUR: "0" })
  const [enabledExtras, setEnabledExtras] = useState<string[]>([])
  const [walletAddress, setWalletAddress] = useState<string>("")
  const [vaByCurrency, setVaByCurrency] = useState<Record<string, VaJson | null>>({})
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const noahHeaders = useMemo(
    () => ({
      "X-Easner-Noah-Scope": "business",
    }),
    [],
  )

  const refreshAccounts = useCallback(async () => {
    setLoadError(null)
    if (!tier1Complete) {
      setBalances({ USD: "0", EUR: "0" })
      setEnabledExtras([])
      setWalletAddress("")
      setVaByCurrency({})
      setLoading(false)
      return
    }

    setLoading(true)
    try {
      const [availRes, balRes, walletRes] = await Promise.all([
        fetchWithSession("/api/accounts/available-currencies", { headers: noahHeaders }),
        fetchWithSession("/api/noah/wallets/balances", { headers: noahHeaders }),
        fetchWithSession("/api/noah/wallets", { headers: noahHeaders }),
      ])

      const avail = (await availRes.json().catch(() => ({}))) as { enabledExtras?: string[]; error?: string }
      if (availRes.ok) {
        setEnabledExtras((avail.enabledExtras ?? []).map((c) => c.toUpperCase()))
      }

      if (balRes.ok) {
        const b = (await balRes.json()) as { USD?: string; EUR?: string }
        setBalances({
          USD: b.USD ?? "0",
          EUR: b.EUR ?? "0",
        })
      }

      if (walletRes.ok) {
        const w = (await walletRes.json()) as { wallets?: Array<{ address?: string }> }
        const addr = w.wallets?.[0]?.address
        setWalletAddress(addr ?? "")
      }

      const extras = (avail.enabledExtras ?? []).map((c) => c.toUpperCase())
      const codes = ["USD", "EUR", ...extras.filter((c) => c !== "USD" && c !== "EUR")]

      const vaEntries: Record<string, VaJson | null> = {}
      await Promise.all(
        codes.map(async (code) => {
          const cur = code.toLowerCase()
          if (cur !== "usd" && cur !== "eur" && cur !== "gbp") {
            vaEntries[code] = null
            return
          }
          const r = await fetchWithSession(`/api/noah/virtual-accounts?currency=${cur}`, { headers: noahHeaders })
          if (!r.ok) {
            vaEntries[code] = null
            return
          }
          vaEntries[code] = (await r.json()) as VaJson
        }),
      )
      setVaByCurrency(vaEntries)
    } catch (e: unknown) {
      setLoadError(e instanceof Error ? e.message : "Could not load accounts.")
    } finally {
      setLoading(false)
    }
  }, [tier1Complete, noahHeaders])

  useEffect(() => {
    if (profileLoading) return
    void refreshAccounts()
  }, [profileLoading, refreshAccounts])

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
        status: tier1Complete && hasVa ? "active" : tier1Complete ? "pending" : "pending",
        stablecoinAddress: walletAddress || undefined,
        stablecoinChain: "Solana",
        stablecoinToken: usdc ? "USDC" : eurc ? "EURC" : "USDC",
      }
    })
  }, [balances, displayName, enabledExtras, tier1Complete, vaByCurrency, walletAddress])

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

"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { currencySymbols } from "@/lib/mock-data"
import type { Account } from "@/lib/mock-data"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { CurrencyDepositDialog } from "@/components/currency-deposit-dialog"
import { FXConvertDialog } from "@/components/fx-convert-dialog"
import { StatementDownloadDialog } from "@/components/statement-download-dialog"
import { CurrencyFlag } from "@/components/flags"
import { MoreVertical, FileText, Ban, Trash2 } from "lucide-react"
import { fetchWithSession } from "@/lib/fetch-with-session"
import { useBusinessProfile } from "@/lib/use-business-profile"
import { OpenCurrencyAccountDialog } from "@/components/accounts/open-currency-account-dialog"

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

function parseBalance(bal: string | undefined): number {
  const n = parseFloat(String(bal ?? "0").replace(/,/g, ""))
  return Number.isFinite(n) ? n : 0
}

export default function AccountsPage() {
  const { tier1Complete, isLoading: profileLoading, name } = useBusinessProfile()
  const [copiedField, setCopiedField] = useState<string | null>(null)
  const [balances, setBalances] = useState<{ USD: string; EUR: string }>({ USD: "0", EUR: "0" })
  const [enabledExtras, setEnabledExtras] = useState<string[]>([])
  const [walletAddress, setWalletAddress] = useState<string>("")
  const [vaByCurrency, setVaByCurrency] = useState<Record<string, VaJson | null>>({})
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text)
    setCopiedField(field)
    setTimeout(() => setCopiedField(null), 2000)
  }

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
          ? parseBalance(balances.USD)
          : currency === "EUR"
            ? parseBalance(balances.EUR)
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

  if (profileLoading) {
    return <div className="text-sm text-muted-foreground">Loading…</div>
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Accounts</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Multi-currency accounts powered by stablecoins
          </p>
        </div>
        <OpenCurrencyAccountDialog onAdded={() => void refreshAccounts()} />
      </div>

      {loadError ? <p className="text-sm text-destructive">{loadError}</p> : null}

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading account details…</p>
      ) : null}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {accountRows.map((account) => (
          <Card key={account.id} className="hover:shadow-md transition-shadow">
            <CardContent className="p-6">
              <div className="flex flex-col h-full">
                <div className="flex-1 space-y-4">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <CurrencyFlag currency={account.currency} size={40} className="rounded-md" />
                      <div>
                        <h3 className="text-lg font-semibold">{account.currency}</h3>
                      </div>
                    </div>
                    <Badge variant="secondary" className="text-xs capitalize">
                      {account.status}
                    </Badge>
                  </div>

                  <div className="mb-10">
                    <p className="text-xs text-muted-foreground mb-1">Available Balance</p>
                    <p className="text-3xl font-semibold">
                      {currencySymbols[account.currency]}
                      {account.balance.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <CurrencyDepositDialog
                    account={account}
                    copiedField={copiedField}
                    onCopy={copyToClipboard}
                  />
                  <FXConvertDialog
                    account={account}
                    destinationCurrencies={accountRows.map((a) => a.currency)}
                    tier1Complete={tier1Complete}
                    noahScopeHeader={noahHeaders}
                    onAfterMove={() => void refreshAccounts()}
                  />

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm" className="px-2 bg-transparent">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <StatementDownloadDialog
                        noahScopeHeader={noahHeaders}
                        accountCurrency={account.currency}
                        trigger={
                          <DropdownMenuItem
                            className="gap-2"
                            onSelect={(e) => e.preventDefault()}
                          >
                            <FileText className="h-4 w-4" />
                            Download Statement
                          </DropdownMenuItem>
                        }
                      />
                      <DropdownMenuSeparator />
                      <DropdownMenuItem className="gap-2">
                        <Ban className="h-4 w-4" />
                        Disable Account
                      </DropdownMenuItem>
                      {account.currency !== "USD" && account.currency !== "EUR" ? (
                        <DropdownMenuItem className="gap-2 text-destructive focus:text-destructive">
                          <Trash2 className="h-4 w-4" />
                          Delete Account
                        </DropdownMenuItem>
                      ) : null}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}

"use client"

import { useEffect, useMemo, useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { MoreHorizontal, Pause, Loader2 } from "lucide-react"
import { CurrencyFlag } from "@/components/flags"
import { getCurrencyCatalog } from "@easner/shared"
import { loadCurrencyActiveOverrides, setCurrencyActiveOverride, type CurrencyActiveOverrides } from "@/lib/currency-overrides"

type CurrencyRow = {
  code: string
  name: string
  active: boolean
}

export function CurrenciesAdminPanel() {
  const catalog = useMemo(() => getCurrencyCatalog(), [])
  const [overrides, setOverrides] = useState<CurrencyActiveOverrides>({})
  const [loading, setLoading] = useState(true)
  const [savingCode, setSavingCode] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    setLoading(true)
    loadCurrencyActiveOverrides()
      .then((o) => {
        if (!alive) return
        setOverrides(o)
      })
      .catch((e) => {
        console.error("Error loading currency overrides:", e)
      })
      .finally(() => {
        if (!alive) return
        setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [])

  const rows: CurrencyRow[] = useMemo(() => {
    const hiddenCodes = new Set(["BMD", "AWG", "ANG", "TOP", "XPF", "SHP", "SBD", "MOP", "KYD", "GIP", "FKP", "FJD", "BZD"]) // Bermudan Dollar, Aruban Florin, Netherlands Antillean Guilder, Tongan Paʻanga, CFP Franc, St. Helena Pound, Solomon Islands Dollar, Macanese Pataca, Cayman Islands Dollar, Gibraltar Pound, Falkland Islands Pound, Fijian Dollar, Belize Dollar

    const augmentedCatalog = (() => {
      const codes = new Set(catalog.map((c) => c.code.toUpperCase()))
      const extra: Array<{ code: string; name: string; symbol: string }> = []
      if (!codes.has("EUR")) extra.push({ code: "EUR", name: "Euro", symbol: "€" })
      if (!codes.has("GBP")) extra.push({ code: "GBP", name: "British Pound Sterling", symbol: "£" })
      if (extra.length === 0) return catalog
      return [...catalog, ...extra]
    })()

    return augmentedCatalog
      .filter((c) => !hiddenCodes.has(c.code.toUpperCase()))
      .map((c) => {
        const upper = c.code.toUpperCase()
        const defaultActive = upper === "USD" || upper === "EUR"
        const active = overrides[upper] ?? defaultActive
        const displayName =
          upper === "ZWG"
            ? "Zimbabwe Gold"
            : upper === "SLE"
              ? "Sierra Leonean Leones"
              : c.name
        return { code: upper, name: displayName, active }
      })
  }, [catalog, overrides])

  const handleToggleCurrency = async (code: string, nextActive: boolean) => {
    const upper = code.toUpperCase()
    try {
      setSavingCode(upper)
      await setCurrencyActiveOverride(upper, nextActive)
      setOverrides((prev) => ({ ...prev, [upper]: nextActive }))
    } catch (error) {
      console.error("Error updating currency override:", error)
    } finally {
      setSavingCode(null)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Currencies</h1>
          <p className="text-gray-600">Activate or suspend currencies available in the product</p>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Currency</TableHead>
                <TableHead>Code</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-[50px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((currency) => (
                <TableRow key={currency.code}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {(() => {
                        const code = currency.code.toUpperCase()
                        const tokenIcons: Record<string, string> = {
                          USDT: "https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/usdt.png",
                          USDC: "https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/usdc.png",
                          SOL: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/solana/info/logo.png",
                          PYUSD: "https://logo.svgcdn.com/token-branded/pyusd.png",
                          BTC: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/bitcoin/info/logo.png",
                          EURC: "https://logo.svgcdn.com/token-branded/eurc.png",
                        }
                        const src = tokenIcons[code]
                        if (src) {
                          return (
                            <img
                              src={src}
                              alt=""
                              className="h-[22px] w-[22px] rounded object-cover shrink-0"
                              loading="lazy"
                            />
                          )
                        }
                        return <CurrencyFlag currency={currency.code} size={22} />
                      })()}
                      <span className="font-medium">{currency.name || currency.code}</span>
                    </div>
                  </TableCell>
                  <TableCell className="font-mono">{currency.code}</TableCell>
                  <TableCell>
                    <Badge
                      className={
                        currency.active ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"
                      }
                    >
                      {currency.active ? "Active" : "Suspended"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() => handleToggleCurrency(currency.code, !currency.active)}
                          disabled={savingCode === currency.code}
                        >
                          {savingCode === currency.code ? (
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          ) : (
                            <Pause className="h-4 w-4 mr-2" />
                          )}
                          {currency.active ? "Suspend" : "Activate"}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
              {!loading && rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="py-10 text-center text-sm text-gray-500">
                    No currencies available.
                  </TableCell>
                </TableRow>
              )}
              {loading && (
                <TableRow>
                  <TableCell colSpan={4} className="py-10 text-center text-sm text-gray-500">
                    Loading currencies…
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}

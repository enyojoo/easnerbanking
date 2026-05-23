"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { PlatformControlTabShell } from "@/components/platform-control/platform-tab-shell"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { currenciesApi } from "@/lib/currencies-api"
import { exchangeRatesApi } from "@/lib/exchange-rates-api"
import { CurrencyFlag } from "@/components/flags"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Checkbox } from "@/components/ui/checkbox"
import { Edit, Loader2, MoreHorizontal, Pause, Plus, Trash2 } from "lucide-react"

type CurrencyRow = {
  id: string
  code: string
  name: string
  symbol: string
  status: string
  can_send?: boolean
  can_receive?: boolean
  flag_svg?: string | null
}

type ExchangeRateRow = {
  id?: string
  from_currency: string
  to_currency: string
  rate: number
  fee_type: "free" | "fixed" | "percentage"
  fee_amount: number
  min_amount?: number | null
  max_amount?: number | null
  status: string
  updated_at?: string
  as_of?: string
}

type EditableRate = ExchangeRateRow & { _key: string }

function defaultRate(from: string, to: string): EditableRate {
  return {
    _key: `${from}_${to}`,
    from_currency: from,
    to_currency: to,
    rate: 1,
    fee_type: "free",
    fee_amount: 0,
    min_amount: null,
    max_amount: null,
    status: "active",
  }
}

function buildDraftForCurrency(
  fromCode: string,
  currencies: CurrencyRow[],
  rates: ExchangeRateRow[],
): EditableRate[] {
  const outbound = rates.filter((r) => r.from_currency === fromCode)
  const others = currencies.map((c) => c.code).filter((c) => c !== fromCode)
  return others.map((to) => {
    const existing = outbound.find((r) => r.to_currency === to)
    if (existing) {
      return { ...existing, _key: `${fromCode}_${to}` }
    }
    return defaultRate(fromCode, to)
  })
}

export function OfficeRatesPanel() {
  const [currencies, setCurrencies] = useState<CurrencyRow[]>([])
  const [rates, setRates] = useState<ExchangeRateRow[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isAddingCurrency, setIsAddingCurrency] = useState(false)
  const [newCurrency, setNewCurrency] = useState({
    code: "",
    name: "",
    symbol: "",
    can_send: true,
    can_receive: true,
  })

  const [editingCurrency, setEditingCurrency] = useState<CurrencyRow | null>(null)
  const [draft, setDraft] = useState<EditableRate[]>([])
  const [currencySettings, setCurrencySettings] = useState({
    can_send: true,
    can_receive: true,
  })

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [currencyList, rateList] = await Promise.all([
        currenciesApi.list({ scope: "rates" }),
        exchangeRatesApi.list(),
      ])
      setCurrencies(currencyList as CurrencyRow[])
      setRates(rateList as ExchangeRateRow[])
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const handleSyncRates = useCallback(async () => {
    setSyncing(true)
    setError(null)
    try {
      await exchangeRatesApi.syncFromModel()
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSyncing(false)
    }
  }, [load])

  const lastRatesUpdate = useMemo(() => {
    let maxMs = 0
    for (const r of rates) {
      for (const raw of [r.updated_at, r.as_of]) {
        if (!raw) continue
        const t = new Date(raw).getTime()
        if (Number.isFinite(t) && t > maxMs) maxMs = t
      }
    }
    return maxMs > 0
      ? new Date(maxMs).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
      : "—"
  }, [rates])

  const openEditRates = (currency: CurrencyRow) => {
    setEditingCurrency(currency)
    setCurrencySettings({
      can_send: currency.can_send ?? true,
      can_receive: currency.can_receive ?? true,
    })
    setDraft(buildDraftForCurrency(currency.code, currencies, rates))
  }

  const closeEditRates = () => {
    setEditingCurrency(null)
    setDraft([])
  }

  const updateDraft = (key: string, patch: Partial<EditableRate>) => {
    setDraft((prev) => prev.map((r) => (r._key === key ? { ...r, ...patch } : r)))
  }

  const handleAddCurrency = async () => {
    setSaving(true)
    setError(null)
    try {
      await currenciesApi.create({
        code: newCurrency.code.toUpperCase(),
        name: newCurrency.name,
        symbol: newCurrency.symbol,
        can_send: newCurrency.can_send,
        can_receive: newCurrency.can_receive,
      })
      setNewCurrency({ code: "", name: "", symbol: "", can_send: true, can_receive: true })
      setIsAddingCurrency(false)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  const handleSuspendCurrency = async (currency: CurrencyRow) => {
    const next = currency.status === "active" ? "suspended" : "active"
    setSaving(true)
    try {
      await currenciesApi.patch(currency.id, { status: next })
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteCurrency = async (currency: CurrencyRow) => {
    if (currencies.length <= 2) {
      setError("Keep at least two currencies in the catalog.")
      return
    }
    if (!confirm(`Delete ${currency.code} and all exchange rates involving it?`)) return
    setSaving(true)
    try {
      await currenciesApi.remove(currency.id)
      if (editingCurrency?.id === currency.id) closeEditRates()
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  const handleSaveEditRates = async () => {
    if (!editingCurrency) return
    setSaving(true)
    setError(null)
    try {
      const payload = draft.map(({ _key: _unused, ...row }) => ({
        from_currency: row.from_currency,
        to_currency: row.to_currency,
        rate: Number(row.rate) || 0,
        fee_type: row.fee_type,
        fee_amount: Number(row.fee_amount) || 0,
        min_amount: row.min_amount ?? null,
        max_amount: row.max_amount ?? null,
        status: row.status || "active",
      }))
      if (payload.length > 0) {
        await exchangeRatesApi.upsert(payload)
      }
      await currenciesApi.patch(editingCurrency.id, {
        can_send: currencySettings.can_send,
        can_receive: currencySettings.can_receive,
      })
      closeEditRates()
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  const showTableSkeleton = loading && currencies.length === 0

  const addCurrencyDialog = (
    <Dialog open={isAddingCurrency} onOpenChange={setIsAddingCurrency}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="h-4 w-4 mr-2" />
          Add currency
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add currency</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Code</Label>
            <Input
              maxLength={8}
              value={newCurrency.code}
              onChange={(e) =>
                setNewCurrency((s) => ({ ...s, code: e.target.value.toUpperCase() }))
              }
              placeholder="KES"
            />
          </div>
          <div className="space-y-2">
            <Label>Name</Label>
            <Input
              value={newCurrency.name}
              onChange={(e) => setNewCurrency((s) => ({ ...s, name: e.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <Label>Symbol</Label>
            <Input
              value={newCurrency.symbol}
              onChange={(e) => setNewCurrency((s) => ({ ...s, symbol: e.target.value }))}
            />
          </div>
          <div className="flex gap-6">
            <div className="flex items-center gap-2">
              <Checkbox
                id="ncs"
                checked={newCurrency.can_send}
                onCheckedChange={(v) => setNewCurrency((s) => ({ ...s, can_send: v === true }))}
              />
              <Label htmlFor="ncs">Can send</Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="ncr"
                checked={newCurrency.can_receive}
                onCheckedChange={(v) =>
                  setNewCurrency((s) => ({ ...s, can_receive: v === true }))
                }
              />
              <Label htmlFor="ncr">Can receive</Label>
            </div>
          </div>
          <Button
            className="w-full"
            disabled={saving || !newCurrency.code || !newCurrency.name || !newCurrency.symbol}
            onClick={() => void handleAddCurrency()}
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Add currency
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )

  return (
    <PlatformControlTabShell
      title="Currencies & exchange rates"
      description={`Last update: ${lastRatesUpdate}`}
      actions={
        <>
          <Button
            type="button"
            size="sm"
            onClick={() => void handleSyncRates()}
            disabled={syncing || loading}
          >
            {syncing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Sync rates
          </Button>
          {addCurrencyDialog}
        </>
      }
    >
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}

      <Card>
        <CardContent className="p-0">
          {showTableSkeleton ? (
            <div className="flex items-center gap-2 p-6 text-muted-foreground text-sm">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading…
            </div>
          ) : currencies.length === 0 ? (
            <p className="text-sm text-muted-foreground p-6">
              No currencies yet. Add a currency or run the platform-control migration, then Sync rates.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Currency</TableHead>
                  <TableHead>Code</TableHead>
                  <TableHead>Symbol</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-[80px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {currencies.map((currency) => (
                  <TableRow key={currency.id}>
                    <TableCell>
                      <span className="flex items-center gap-2 font-medium">
                        <CurrencyFlag
                          currency={currency.code}
                          size={16}
                          fallbackSvg={currency.flag_svg}
                        />
                        {currency.name}
                      </span>
                    </TableCell>
                    <TableCell className="font-mono">{currency.code}</TableCell>
                    <TableCell>{currency.symbol}</TableCell>
                    <TableCell>
                      <Badge variant={currency.status === "active" ? "default" : "secondary"}>
                        {currency.status}
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
                          <DropdownMenuItem onClick={() => openEditRates(currency)}>
                            <Edit className="h-4 w-4 mr-2" />
                            Edit rates
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => void handleSuspendCurrency(currency)}>
                            <Pause className="h-4 w-4 mr-2" />
                            {currency.status === "active" ? "Suspend" : "Activate"}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-destructive"
                            onClick={() => void handleDeleteCurrency(currency)}
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={editingCurrency != null}
        onOpenChange={(open) => {
          if (!open) closeEditRates()
        }}
      >
        <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
          <DialogHeader className="border-b pb-4">
            <DialogTitle>
              Edit rates — {editingCurrency?.name} ({editingCurrency?.code})
            </DialogTitle>
            <div className="flex flex-wrap items-center gap-6 pt-3">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="edit-can-send"
                  checked={currencySettings.can_send}
                  onCheckedChange={(v) =>
                    setCurrencySettings((s) => ({ ...s, can_send: v === true }))
                  }
                />
                <Label htmlFor="edit-can-send">Can send</Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="edit-can-receive"
                  checked={currencySettings.can_receive}
                  onCheckedChange={(v) =>
                    setCurrencySettings((s) => ({ ...s, can_receive: v === true }))
                  }
                />
                <Label htmlFor="edit-can-receive">Can receive</Label>
              </div>
            </div>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto py-2 space-y-4">
            {draft.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4">
                No other currencies to price against. Add another currency first.
              </p>
            ) : (
              draft.map((row) => {
                const feeType = row.fee_type
                const from = editingCurrency?.code ?? row.from_currency
                return (
                  <div key={row._key} className="rounded-lg border p-4 space-y-4">
                    <p className="font-medium flex items-center gap-2">
                      <CurrencyFlag
                        currency={from}
                        size={16}
                        fallbackSvg={currencies.find((c) => c.code === from)?.flag_svg}
                      />
                      {from}
                      <span className="text-muted-foreground">→</span>
                      <CurrencyFlag
                        currency={row.to_currency}
                        size={16}
                        fallbackSvg={currencies.find((c) => c.code === row.to_currency)?.flag_svg}
                      />
                      {row.to_currency}
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                      <div className="space-y-2">
                        <Label>Exchange rate</Label>
                        <Input
                          type="number"
                          step="0.0001"
                          value={row.rate}
                          onChange={(e) =>
                            updateDraft(row._key, { rate: parseFloat(e.target.value) || 0 })
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Fee type</Label>
                        <Select
                          value={feeType}
                          onValueChange={(v) =>
                            updateDraft(row._key, {
                              fee_type: v as EditableRate["fee_type"],
                            })
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="free">Free</SelectItem>
                            <SelectItem value="fixed">Fixed</SelectItem>
                            <SelectItem value="percentage">Percentage</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>
                          {feeType === "percentage" ? "Fee (%)" : `Fee (${from})`}
                        </Label>
                        <Input
                          type="number"
                          step="any"
                          disabled={feeType === "free"}
                          value={row.fee_amount}
                          onChange={(e) =>
                            updateDraft(row._key, {
                              fee_amount: parseFloat(e.target.value) || 0,
                            })
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Min ({from})</Label>
                        <Input
                          type="number"
                          step="any"
                          value={row.min_amount ?? ""}
                          onChange={(e) =>
                            updateDraft(row._key, {
                              min_amount: e.target.value ? parseFloat(e.target.value) : null,
                            })
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Max ({from})</Label>
                        <Input
                          type="number"
                          step="any"
                          value={row.max_amount ?? ""}
                          onChange={(e) =>
                            updateDraft(row._key, {
                              max_amount: e.target.value ? parseFloat(e.target.value) : null,
                            })
                          }
                        />
                      </div>
                    </div>
                  </div>
                )
              })
            )}
          </div>

          <DialogFooter className="border-t pt-4">
            <Button variant="outline" onClick={closeEditRates} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={() => void handleSaveEditRates()} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PlatformControlTabShell>
  )
}

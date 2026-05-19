"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
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
import { supabase } from "@/lib/supabase"
import { CurrencyFlag } from "@/components/flags"
import { Loader2, Save } from "lucide-react"

type CurrencyRow = {
  id: string
  code: string
  name: string
  symbol: string
  status: string
  can_send?: boolean
  can_receive?: boolean
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

export function OfficeRatesPanel() {
  const [currencies, setCurrencies] = useState<CurrencyRow[]>([])
  const [rates, setRates] = useState<ExchangeRateRow[]>([])
  const [selectedCode, setSelectedCode] = useState<string>("")
  const [draft, setDraft] = useState<EditableRate[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [curRes, rateRes] = await Promise.all([
        supabase.from("currencies").select("*").order("code"),
        supabase.from("exchange_rates").select("*"),
      ])
      if (curRes.error) throw curRes.error
      if (rateRes.error) throw rateRes.error
      setCurrencies((curRes.data || []) as CurrencyRow[])
      setRates((rateRes.data || []) as ExchangeRateRow[])
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    const channel = supabase
      .channel("office-exchange-rates")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "exchange_rates" },
        () => {
          void load()
        },
      )
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [load])

  const lastRatesUpdate = useMemo(() => {
    let max = 0
    for (const r of rates) {
      const t = r.updated_at ? new Date(r.updated_at).getTime() : 0
      if (t > max) max = t
    }
    return max > 0 ? new Date(max).toLocaleString() : "—"
  }, [rates])

  useEffect(() => {
    if (!selectedCode && currencies.length > 0) {
      setSelectedCode(currencies[0].code)
    }
  }, [currencies, selectedCode])

  useEffect(() => {
    if (!selectedCode) return
    const outbound = rates.filter((r) => r.from_currency === selectedCode)
    const others = currencies.map((c) => c.code).filter((c) => c !== selectedCode)
    const rows: EditableRate[] = others.map((to) => {
      const existing = outbound.find((r) => r.to_currency === to)
      if (existing) {
        return { ...existing, _key: `${selectedCode}_${to}` }
      }
      return defaultRate(selectedCode, to)
    })
    setDraft(rows)
  }, [selectedCode, rates, currencies])

  const selectedCurrency = currencies.find((c) => c.code === selectedCode)

  const updateDraft = (key: string, patch: Partial<EditableRate>) => {
    setDraft((prev) => prev.map((r) => (r._key === key ? { ...r, ...patch } : r)))
  }

  const patchSelectedCurrency = (patch: Partial<CurrencyRow>) => {
    setCurrencies((prev) =>
      prev.map((c) => (c.code === selectedCode ? { ...c, ...patch } : c)),
    )
  }

  const saveCurrencyFlags = async () => {
    if (!selectedCurrency) return
    setSaving(true)
    try {
      const { error: upErr } = await supabase
        .from("currencies")
        .update({
          can_send: selectedCurrency.can_send ?? true,
          can_receive: selectedCurrency.can_receive ?? true,
          status: selectedCurrency.status,
          updated_at: new Date().toISOString(),
        })
        .eq("id", selectedCurrency.id)
      if (upErr) throw upErr
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  const saveRates = async () => {
    if (!selectedCode) return
    setSaving(true)
    setError(null)
    try {
      const now = new Date().toISOString()
      const payload = draft.map(({ _key: _unused, ...row }) => ({
        from_currency: row.from_currency,
        to_currency: row.to_currency,
        rate: Number(row.rate) || 0,
        fee_type: row.fee_type,
        fee_amount: Number(row.fee_amount) || 0,
        min_amount: row.min_amount ?? null,
        max_amount: row.max_amount ?? null,
        status: row.status || "active",
        updated_at: now,
      }))
      const { error: upErr } = await supabase.from("exchange_rates").upsert(payload, {
        onConflict: "from_currency,to_currency",
      })
      if (upErr) throw upErr
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  if (loading && currencies.length === 0) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold">Currencies & exchange rates</h2>
          <p className="text-sm text-muted-foreground">
            Admin fees and limits. Automated sync updates <code>rate</code> only (P2P cron).
          </p>
          <p className="text-xs text-muted-foreground mt-1">Last rate update: {lastRatesUpdate}</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
          Refresh
        </Button>
      </div>

      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Currency</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-4 items-end">
          <div className="space-y-2 min-w-[200px]">
            <Label>Edit outbound from</Label>
            <Select value={selectedCode} onValueChange={setSelectedCode}>
              <SelectTrigger>
                <SelectValue placeholder="Select currency" />
              </SelectTrigger>
              <SelectContent>
                {currencies.map((c) => (
                  <SelectItem key={c.code} value={c.code}>
                    <span className="flex items-center gap-2">
                      <CurrencyFlag currency={c.code} size={16} />
                      {c.code}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {selectedCurrency ? (
            <>
              <div className="flex items-center gap-2">
                <Switch
                  checked={selectedCurrency.can_send ?? true}
                  onCheckedChange={(v) => patchSelectedCurrency({ can_send: v })}
                />
                <Label>Can send</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={selectedCurrency.can_receive ?? true}
                  onCheckedChange={(v) => patchSelectedCurrency({ can_receive: v })}
                />
                <Label>Can receive</Label>
              </div>
              <Badge variant={selectedCurrency.status === "active" ? "default" : "secondary"}>
                {selectedCurrency.status}
              </Badge>
              <Button size="sm" onClick={() => void saveCurrencyFlags()} disabled={saving}>
                Save currency flags
              </Button>
            </>
          ) : null}
        </CardContent>
      </Card>

      {selectedCode ? (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Corridors from {selectedCode}</CardTitle>
            <Button size="sm" onClick={() => void saveRates()} disabled={saving}>
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              Save rates
            </Button>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>To</TableHead>
                  <TableHead>Rate</TableHead>
                  <TableHead>Fee type</TableHead>
                  <TableHead>Fee</TableHead>
                  <TableHead>Min send</TableHead>
                  <TableHead>Max send</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {draft.map((row) => (
                  <TableRow key={row._key}>
                    <TableCell>
                      <span className="flex items-center gap-2">
                        <CurrencyFlag currency={row.to_currency} size={16} />
                        {row.to_currency}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        step="any"
                        className="w-28"
                        value={row.rate}
                        onChange={(e) =>
                          updateDraft(row._key, { rate: parseFloat(e.target.value) || 0 })
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <Select
                        value={row.fee_type}
                        onValueChange={(v) =>
                          updateDraft(row._key, {
                            fee_type: v as EditableRate["fee_type"],
                          })
                        }
                      >
                        <SelectTrigger className="w-28">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="free">free</SelectItem>
                          <SelectItem value="fixed">fixed</SelectItem>
                          <SelectItem value="percentage">percentage</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        step="any"
                        className="w-24"
                        value={row.fee_amount}
                        onChange={(e) =>
                          updateDraft(row._key, {
                            fee_amount: parseFloat(e.target.value) || 0,
                          })
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        step="any"
                        className="w-24"
                        value={row.min_amount ?? ""}
                        onChange={(e) =>
                          updateDraft(row._key, {
                            min_amount: e.target.value ? parseFloat(e.target.value) : null,
                          })
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        step="any"
                        className="w-24"
                        value={row.max_amount ?? ""}
                        onChange={(e) =>
                          updateDraft(row._key, {
                            max_amount: e.target.value ? parseFloat(e.target.value) : null,
                          })
                        }
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}

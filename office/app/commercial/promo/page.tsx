"use client"

import { useEffect, useState } from "react"
import { OfficeDashboardLayout } from "@/components/layout/office-dashboard-layout"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { commercialApi } from "@/lib/commercial-api"
import type { PromoRule } from "@/lib/types/commercial"

export default function CommercialPromoPage() {
  const [rows, setRows] = useState<PromoRule[]>([])
  const [loading, setLoading] = useState(true)
  const [notice, setNotice] = useState<string | null>(null)
  const [code, setCode] = useState("")
  const [name, setName] = useState("")
  const [discountType, setDiscountType] = useState("percentage")
  const [discountValue, setDiscountValue] = useState("0")

  const load = async () => {
    setLoading(true)
    try {
      const data = await commercialApi.listPromoRules()
      setRows(data)
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Failed to load promo rules")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const onCreate = async () => {
    if (!code.trim() || !name.trim()) {
      setNotice("Code and name are required.")
      return
    }
    try {
      await commercialApi.createPromoRule({
        code: code.trim().toUpperCase(),
        name: name.trim(),
        discount_type: discountType,
        discount_value: Number(discountValue || 0),
      })
      setNotice("Promo rule created.")
      setCode("")
      setName("")
      await load()
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Failed to create promo rule")
    }
  }

  return (
    <OfficeDashboardLayout>
      <div className="p-6 space-y-6">
        <h1 className="text-2xl font-bold">Promo & Waiver Controls</h1>
        {notice ? <p className="text-sm text-blue-700">{notice}</p> : null}

        <Card>
          <CardHeader>
            <CardTitle>Create Promo Rule</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="space-y-2">
                <Label>Code</Label>
                <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="WELCOME10" />
              </div>
              <div className="space-y-2">
                <Label>Name</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Welcome Offer" />
              </div>
              <div className="space-y-2">
                <Label>Discount Type</Label>
                <Input value={discountType} onChange={(e) => setDiscountType(e.target.value)} placeholder="percentage" />
              </div>
              <div className="space-y-2">
                <Label>Discount Value</Label>
                <Input value={discountValue} onChange={(e) => setDiscountValue(e.target.value)} />
              </div>
            </div>
            <Button onClick={onCreate}>Create Promo Rule</Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Promo Rules</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-sm text-muted-foreground">Loading promo rules...</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Code</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Value</TableHead>
                    <TableHead>Used</TableHead>
                    <TableHead>Active</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((promo) => (
                    <TableRow key={promo.id}>
                      <TableCell className="font-medium">{promo.code}</TableCell>
                      <TableCell>{promo.name}</TableCell>
                      <TableCell>{promo.discount_type}</TableCell>
                      <TableCell>{promo.discount_value}</TableCell>
                      <TableCell>{promo.used_count}</TableCell>
                      <TableCell>{promo.is_active ? "Yes" : "No"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </OfficeDashboardLayout>
  )
}

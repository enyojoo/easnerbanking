"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { PayrollPerson, PayrollPersonInput, PayrollRail } from "@/lib/payroll/types"

const rails: PayrollRail[] = ["easetag", "bank", "mobile", "intl_bank", "crypto"]

export function PayrollPersonForm({
  initial,
  onSubmit,
  onCancel,
  submitting,
}: {
  initial?: Partial<PayrollPerson>
  onSubmit: (values: PayrollPersonInput) => void | Promise<void>
  onCancel: () => void
  submitting?: boolean
}) {
  const [type, setType] = useState<"employee" | "contractor">(initial?.type ?? "employee")
  const [fullName, setFullName] = useState(initial?.fullName ?? "")
  const [email, setEmail] = useState(initial?.email ?? "")
  const [country, setCountry] = useState(initial?.country ?? "")
  const [defaultAmount, setDefaultAmount] = useState(String(initial?.defaultAmount ?? ""))
  const [payCurrency, setPayCurrency] = useState(initial?.payCurrency ?? "USD")
  const [rail, setRail] = useState<PayrollRail>(initial?.rail ?? "bank")
  const [easetag, setEasetag] = useState(initial?.easetag ?? "")

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault()
        void onSubmit({
          type,
          fullName,
          email: email || null,
          country: country || null,
          defaultAmount: Number(defaultAmount) || 0,
          payCurrency,
          rail,
          easetag: rail === "easetag" ? easetag.replace(/^@+/, "") : null,
          payBasis: "fixed",
        })
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Type</Label>
          <Select value={type} onValueChange={(v) => setType(v as "employee" | "contractor")}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="employee">Employee</SelectItem>
              <SelectItem value="contractor">Contractor</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Rail</Label>
          <Select value={rail} onValueChange={(v) => setRail(v as PayrollRail)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {rails.map((r) => (
                <SelectItem key={r} value={r}>
                  {r}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        <Label>Full name</Label>
        <Input value={fullName} onChange={(e) => setFullName(e.target.value)} required />
      </div>

      <div className="space-y-2">
        <Label>Email</Label>
        <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>

      {rail === "easetag" ? (
        <div className="space-y-2">
          <Label>EASETAG</Label>
          <Input
            value={easetag}
            onChange={(e) => setEasetag(e.target.value)}
            placeholder="handle"
            required
          />
        </div>
      ) : (
        <div className="space-y-2">
          <Label>Country</Label>
          <Input value={country} onChange={(e) => setCountry(e.target.value)} placeholder="US" />
          <p className="text-xs text-muted-foreground">
            Link a saved recipient from Settings after creating this person, or add bank/MoMo details
            there first.
          </p>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Default amount</Label>
          <Input
            inputMode="decimal"
            className="tabular-nums"
            value={defaultAmount}
            onChange={(e) => setDefaultAmount(e.target.value)}
            required
          />
        </div>
        <div className="space-y-2">
          <Label>Pay currency</Label>
          <Input value={payCurrency} onChange={(e) => setPayCurrency(e.target.value.toUpperCase())} />
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" disabled={submitting}>
          Save
        </Button>
      </div>
    </form>
  )
}

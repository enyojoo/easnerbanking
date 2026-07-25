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
import { useRecipientsCached } from "@/hooks/use-recipients-cached"
import { fetchEasenetProfileByTag, type EasenetPublicProfile } from "@/lib/easenet-profile"

function railForDestination(input: { mobileProvider?: string; walletNetwork?: string }): PayrollRail {
  if (input.mobileProvider) return "mobile"
  if (input.walletNetwork) return "crypto"
  return "bank"
}

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
  const [creationMethod, setCreationMethod] = useState<"easetag" | "manual">(
    initial?.rail === "easetag" ? "easetag" : "manual",
  )
  const [recipientId, setRecipientId] = useState(initial?.recipientId ?? "")
  const destinationsQuery = useRecipientsCached(creationMethod === "manual")
  const destinations = (destinationsQuery.data ?? []).filter((item) => !item.payeeEasetag)
  const [easetagProfile, setEasetagProfile] = useState<EasenetPublicProfile | null>(null)
  const [checkingEasetag, setCheckingEasetag] = useState(false)

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
          recipientId: rail === "easetag" ? null : recipientId || null,
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
          <Label>Add with</Label>
          <Select value={creationMethod} onValueChange={(v) => {
            const method = v as "easetag" | "manual"
            setCreationMethod(method)
            if (method === "easetag") setRail("easetag")
          }}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="easetag">EASETAG connection</SelectItem>
              <SelectItem value="manual">Manual person</SelectItem>
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

      {creationMethod === "easetag" ? (
        <div className="space-y-2">
          <Label>EASETAG</Label>
          <Input
            value={easetag}
            onChange={(e) => { setEasetag(e.target.value); setEasetagProfile(null) }}
            placeholder="handle"
            required
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={checkingEasetag || easetag.trim().length < 4}
            onClick={async () => {
              setCheckingEasetag(true)
              const profile = await fetchEasenetProfileByTag(easetag).catch(() => ({ found: false } as const))
              setCheckingEasetag(false)
              if (!profile.found) {
                setEasetagProfile(null)
                return
              }
              setEasetagProfile(profile)
              setEasetag(profile.easetag)
              if (!fullName.trim()) setFullName(profile.fullName)
            }}
          >
            {checkingEasetag ? "Checking…" : "Verify EASETAG"}
          </Button>
          {easetagProfile ? (
            <div className="rounded-xl border border-border/70 bg-muted/40 p-3 text-sm">
              <p className="font-medium">{easetagProfile.fullName}</p>
              <p className="text-muted-foreground">
                @{easetagProfile.easetag} · {easetagProfile.accountKind} · {easetagProfile.verified ? "Verified" : "Unverified"}
              </p>
              {!easetagProfile.verified || easetagProfile.accountKind !== "personal" ? (
                <p className="mt-2 text-amber-700">
                  Payroll connections require a verified personal EASETAG.
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : (
        <>
          <div className="space-y-2">
            <Label>Payment method</Label>
            <Select value={recipientId} onValueChange={(id) => {
              setRecipientId(id)
              const destination = destinations.find((item) => item.id === id)
              if (!destination) return
              setRail(railForDestination(destination))
              setPayCurrency(destination.currency || payCurrency)
              setCountry(destination.countryCode || country)
            }}>
              <SelectTrigger>
                <SelectValue placeholder="Choose bank, mobile money, or stablecoin" />
              </SelectTrigger>
              <SelectContent>
                {destinations.map((destination) => (
                  <SelectItem key={destination.id} value={destination.id}>
                    {destination.name} · {destination.mobileProvider || destination.walletNetwork || destination.bankName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Payroll keeps this method private and uses the existing verified payout details internally.
            </p>
          </div>
          <div className="space-y-2">
            <Label>Country</Label>
            <Input value={country} onChange={(e) => setCountry(e.target.value)} placeholder="US" />
          </div>
        </>
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
        <Button type="submit" variant="primary" disabled={
          submitting ||
          (creationMethod === "manual" && !recipientId) ||
          (creationMethod === "easetag" && (
            (!easetagProfile && !initial) ||
            Boolean(easetagProfile && (!easetagProfile.verified || easetagProfile.accountKind !== "personal"))
          ))
        }>
          Save
        </Button>
      </div>
    </form>
  )
}

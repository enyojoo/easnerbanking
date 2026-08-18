"use client"

import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { TerminalPayoutSetupPanel } from "@/components/terminal/terminal-payout-setup-panel"
import { AutopayoutPayerWalletPanel } from "@/components/autopayout/autopayout-payer-wallet-panel"
import { fetchWithSession } from "@/lib/fetch-with-session"
import { normalizePaymentLinkSlug } from "@/lib/payment-links/slug"
import type { PaymentLinkRail } from "@/lib/payment-links/types"
import type { PaymentLinkListRow } from "@/hooks/use-payment-links"
import { getPayAppPublicOrigin } from "@/lib/customer-hosts"
import { cn } from "@/lib/utils"

const BUSINESS_ACCOUNT_SCOPE_HEADERS = { "X-Easner-Account-Scope": "business" } as const

type Rail = "one_time" | "recurring" | "stablecoin"

const RAIL_OPTIONS: { value: Rail; title: string; blurb: string }[] = [
  { value: "one_time", title: "One-time", blurb: "Card and bank, charged once." },
  { value: "recurring", title: "Recurring", blurb: "Card and bank, billed on a schedule." },
  { value: "stablecoin", title: "Stablecoin", blurb: "Deposit address with a printable code." },
]

const CURRENCIES = ["USD", "EUR", "GBP"]

export function CreatePaymentLinkDialog({
  open,
  onOpenChange,
  easetag,
  initialRail,
  onCreated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  easetag: string | null
  /** Preselect a rail when the flow is opened from a deep link. */
  initialRail?: PaymentLinkRail
  onCreated: (link: PaymentLinkListRow) => void
}) {
  const defaultRail: Rail = initialRail === "stablecoin" ? "stablecoin" : "one_time"
  const [rail, setRail] = useState<Rail>(defaultRail)
  const [label, setLabel] = useState("")
  const [slugEdited, setSlugEdited] = useState(false)
  const [slug, setSlug] = useState("")
  const [amount, setAmount] = useState("")
  const [currency, setCurrency] = useState("USD")
  const [description, setDescription] = useState("")
  const [interval, setInterval] = useState<"month" | "year">("month")
  const [trialDays, setTrialDays] = useState("")
  const [redirectUrl, setRedirectUrl] = useState("")
  const [recipientId, setRecipientId] = useState<string | null>(null)
  const [payerWalletId, setPayerWalletId] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!slugEdited) setSlug(normalizePaymentLinkSlug(label))
  }, [label, slugEdited])

  const previewUrl = useMemo(() => {
    const origin = getPayAppPublicOrigin().replace(/^https?:\/\//, "")
    if (!slug) return `${origin}/…`
    return easetag ? `${origin}/${easetag}/${slug}` : `${origin}/plink_…`
  }, [easetag, slug])

  const reset = () => {
    setRail(defaultRail)
    setLabel("")
    setSlug("")
    setSlugEdited(false)
    setAmount("")
    setCurrency("USD")
    setDescription("")
    setInterval("month")
    setTrialDays("")
    setRedirectUrl("")
    setRecipientId(null)
    setPayerWalletId(null)
  }

  const submit = async () => {
    if (rail === "stablecoin" && (!recipientId || !payerWalletId)) {
      toast.error("Choose a payer wallet and a payout account.")
      return
    }
    setSubmitting(true)
    try {
      const res = await fetchWithSession("/api/payment-links", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...BUSINESS_ACCOUNT_SCOPE_HEADERS },
        body: JSON.stringify({
          label,
          slug,
          description: description || null,
          amount,
          currency,
          rail: rail === "stablecoin" ? "stablecoin" : "card_bank",
          mode: rail === "recurring" ? "subscription" : "one_time",
          billing_interval: rail === "recurring" ? interval : undefined,
          trial_days: rail === "recurring" && trialDays ? Number(trialDays) : null,
          redirect_url: redirectUrl || null,
          recipient_id: rail === "stablecoin" ? recipientId : undefined,
          payer_wallet_id: rail === "stablecoin" ? payerWalletId : undefined,
        }),
      })
      const body = (await res.json().catch(() => ({}))) as {
        link?: PaymentLinkListRow
        error?: string
      }
      if (!res.ok || !body.link) {
        toast.error(body.error || "Could not create link.")
        return
      }
      toast.success("Link created.")
      onCreated(body.link)
      reset()
      onOpenChange(false)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset()
        onOpenChange(next)
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Create payment link</DialogTitle>
          <DialogDescription>
            Share one link and let customers pay you without an invoice.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          <div className="space-y-2">
            <Label>How customers pay</Label>
            <div className="grid gap-2 sm:grid-cols-3">
              {RAIL_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setRail(option.value)}
                  className={cn(
                    "rounded-lg border p-3 text-left transition-colors",
                    rail === option.value
                      ? "border-primary bg-primary/5"
                      : "border-border hover:bg-muted/50",
                  )}
                  aria-pressed={rail === option.value}
                >
                  <span className="block text-sm font-medium text-foreground">{option.title}</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">{option.blurb}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="link-label">Name</Label>
              <Input
                id="link-label"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="Consulting retainer"
              />
              <p className="text-xs text-muted-foreground">
                Customers see this on the payment page.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="link-amount">Amount</Label>
              <Input
                id="link-amount"
                type="number"
                min="0"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="500.00"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="link-currency">Currency</Label>
              <Select value={currency} onValueChange={setCurrency}>
                <SelectTrigger id="link-currency" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map((code) => (
                    <SelectItem key={code} value={code}>
                      {code}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {rail === "recurring" ? (
              <>
                <div className="space-y-2">
                  <Label htmlFor="link-interval">Billed every</Label>
                  <Select
                    value={interval}
                    onValueChange={(value) => setInterval(value as "month" | "year")}
                  >
                    <SelectTrigger id="link-interval" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="month">Month</SelectItem>
                      <SelectItem value="year">Year</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="link-trial">Free days before first charge</Label>
                  <Input
                    id="link-trial"
                    type="number"
                    min="0"
                    step="1"
                    value={trialDays}
                    onChange={(e) => setTrialDays(e.target.value)}
                    placeholder="0"
                  />
                </div>
              </>
            ) : null}

            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="link-description">Description (optional)</Label>
              <Textarea
                id="link-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                placeholder="What this payment covers"
              />
            </div>

            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="link-slug">Link address</Label>
              <Input
                id="link-slug"
                value={slug}
                onChange={(e) => {
                  setSlugEdited(true)
                  setSlug(normalizePaymentLinkSlug(e.target.value))
                }}
                placeholder="consulting-retainer"
              />
              <p className="text-xs text-muted-foreground">
                {previewUrl}
                {easetag ? null : " — add an @easetag in Settings for shorter links."}
              </p>
            </div>

            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="link-redirect">After payment (optional)</Label>
              <Input
                id="link-redirect"
                value={redirectUrl}
                onChange={(e) => setRedirectUrl(e.target.value)}
                placeholder="https://yoursite.com/thank-you"
              />
              <p className="text-xs text-muted-foreground">
                Leave empty to use the Easner thank-you page.
              </p>
            </div>
          </div>

          {rail === "stablecoin" ? (
            <div className="space-y-4 rounded-lg border p-4">
              <div>
                <p className="text-sm font-medium text-foreground">Deposits and settlement</p>
                <p className="text-xs text-muted-foreground">
                  Choose what customers pay with and where the money settles.
                </p>
              </div>
              <AutopayoutPayerWalletPanel
                selectedWalletId={payerWalletId}
                onSelectWalletId={(id) => setPayerWalletId(id.trim() ? id : null)}
                syncListsOnMount
              />
              <TerminalPayoutSetupPanel
                active
                variant="pick-recipient"
                embedded
                syncListsOnMount
                selectedRecipientId={recipientId}
                onSelectRecipientId={(id) => setRecipientId(id || null)}
              />
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => void submit()}
            disabled={submitting || !label.trim() || !slug || !amount}
          >
            {submitting ? "Creating…" : "Create link"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

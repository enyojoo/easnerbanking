"use client"

import { useCallback, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowLeft } from "lucide-react"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { TerminalPayoutSetupPanel } from "@/components/terminal/terminal-payout-setup-panel"
import { AutopayoutPayerWalletPanel } from "@/components/autopayout/autopayout-payer-wallet-panel"
import { fetchWithSession } from "@/lib/fetch-with-session"
import { toast } from "sonner"
import { useAuth } from "@/lib/auth-context"
import { dataCache, CACHE_KEYS } from "@/lib/cache"
import { SectionHeader } from "@/components/copy/section-header"
import { QR_PAY_CREATE_SECTION_COPY } from "@/lib/copy/business-ui-copy"

const BUSINESS_ACCOUNT_SCOPE_HEADERS = { "X-Easner-Account-Scope": "business" } as const

export default function QrPayCreatePlacardPage() {
  const router = useRouter()
  const { user } = useAuth()
  const [payerWalletId, setPayerWalletId] = useState<string | null>(null)
  const [recipientId, setRecipientId] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const onSelectRecipient = useCallback((id: string) => {
    setRecipientId(id || null)
  }, [])

  const onSelectPayerWallet = useCallback((id: string) => {
    setPayerWalletId(id.trim() ? id : null)
  }, [])

  const handleSubmit = async () => {
    if (!recipientId || !payerWalletId) {
      toast.error("Choose a payer wallet and a payout account.")
      return
    }
    setSubmitting(true)
    try {
      const res = await fetchWithSession("/api/autopayout", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...BUSINESS_ACCOUNT_SCOPE_HEADERS },
        body: JSON.stringify({
          recipient_id: recipientId,
          payer_wallet_id: payerWalletId,
        }),
      })
      const body = (await res.json().catch(() => ({}))) as {
        error?: string
        autopayout?: { id?: string }
      }
      if (!res.ok) {
        toast.error(body.error || "Could not create placard.")
        return
      }
      const autopayoutId = body.autopayout?.id
      if (autopayoutId) {
        const placardRes = await fetchWithSession(`/api/autopayout/${encodeURIComponent(autopayoutId)}/placard`, {
          method: "POST",
          headers: { ...BUSINESS_ACCOUNT_SCOPE_HEADERS },
        })
        const placardBody = (await placardRes.json().catch(() => ({}))) as { error?: string; cached?: boolean }
        if (!placardRes.ok) {
          toast.error(placardBody.error || "Placard config saved; PNG/PDF generation failed. Retry from the list.")
        } else if (placardBody.cached) {
          toast.success("Placard ready (assets already up to date).")
        } else {
          toast.success("Placard created with PNG and PDF.")
        }
      } else {
        toast.success("Placard created.")
      }
      if (user?.id) {
        dataCache.invalidate(CACHE_KEYS.AUTOPAYOUT_LIST(user.id))
        dataCache.invalidate(CACHE_KEYS.AUTOPAYOUT_PAYER_WALLETS(user.id))
      }
      router.push("/links")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8 pb-12">
      <div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="shrink-0 -ml-2 text-muted-foreground" asChild>
            <Link href="/links" aria-label="Back to Payment Links">
              <ArrowLeft className="h-5 w-5" aria-hidden />
            </Link>
          </Button>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Create Placard</h1>
        </div>
        <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
          Choose the payer wallet and asset customers see, where fiat settles, then create placard files.
        </p>
      </div>

      <Card>
        <CardHeader>
          <SectionHeader
            title="Placard details"
            description={QR_PAY_CREATE_SECTION_COPY.placard}
          />
        </CardHeader>
        <CardContent>
          <AutopayoutPayerWalletPanel
            selectedWalletId={payerWalletId}
            onSelectWalletId={onSelectPayerWallet}
            syncListsOnMount
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <SectionHeader
            title="Payout setup"
            description={QR_PAY_CREATE_SECTION_COPY.payout}
          />
        </CardHeader>
        <CardContent>
          <TerminalPayoutSetupPanel
            active
            variant="pick-recipient"
            embedded
            syncListsOnMount
            selectedRecipientId={recipientId}
            onSelectRecipientId={onSelectRecipient}
          />
        </CardContent>
      </Card>

      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="outline" asChild>
          <Link href="/links">Cancel</Link>
        </Button>
        <Button type="button" onClick={() => void handleSubmit()} disabled={submitting}>
          {submitting ? "Creating…" : "Create placard"}
        </Button>
      </div>
    </div>
  )
}

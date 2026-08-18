"use client"

import { useEffect, useMemo, useState, type ReactNode } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Check, Circle, Edit, Loader2, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  CheckoutCodeBlock,
  RevealOnceValue,
} from "@/components/checkout/checkout-code-block"
import { CheckoutHubSkeleton } from "@/components/collections/collections-skeletons"
import {
  createCheckoutSite,
  saveCheckoutSettings,
  updateCheckoutSite,
  useCheckoutSettings,
  type CheckoutApiKey,
  type CheckoutHubPayload,
  type CheckoutSite,
} from "@/hooks/use-checkout-settings"
import { fetchWithSession } from "@/lib/fetch-with-session"
import { COLLECTIONS_COPY } from "@/lib/copy/business-ui-copy"
import {
  CHECKOUT_PHASES,
  completedCheckoutSteps,
  phaseComplete,
  type CheckoutPhaseId,
  type CheckoutStepId,
} from "@/lib/checkout/checkout-phases"
import { cn } from "@/lib/utils"

const PHASE_COPY: Record<CheckoutPhaseId, { title: string }> = {
  connect_site: { title: COLLECTIONS_COPY.phaseConnect },
  integrate: { title: COLLECTIONS_COPY.phaseIntegrate },
  verify: { title: COLLECTIONS_COPY.phaseGoLive },
}

const STEP_COPY: Record<CheckoutStepId, { title: string; blurb: string }> = {
  website: { title: COLLECTIONS_COPY.stepWebsiteTitle, blurb: COLLECTIONS_COPY.stepWebsiteBlurb },
  urls: { title: COLLECTIONS_COPY.stepUrlsTitle, blurb: COLLECTIONS_COPY.stepUrlsBlurb },
  keys: { title: COLLECTIONS_COPY.stepKeysTitle, blurb: COLLECTIONS_COPY.stepKeysBlurb },
  snippet: { title: COLLECTIONS_COPY.stepSnippetTitle, blurb: COLLECTIONS_COPY.stepSnippetBlurb },
  session: { title: COLLECTIONS_COPY.stepSessionTitle, blurb: COLLECTIONS_COPY.stepSessionBlurb },
  webhook: { title: COLLECTIONS_COPY.stepWebhookTitle, blurb: COLLECTIONS_COPY.stepWebhookBlurb },
  test: { title: COLLECTIONS_COPY.stepTestTitle, blurb: COLLECTIONS_COPY.stepTestBlurb },
  live: { title: COLLECTIONS_COPY.stepLiveTitle, blurb: COLLECTIONS_COPY.stepLiveBlurb },
}

export function CheckoutIntegrationHub({
  flow,
  siteId = null,
}: {
  flow: "create" | "edit"
  siteId?: string | null
}) {
  const router = useRouter()
  const { data, loading, error, refetch } = useCheckoutSettings()
  const [phase, setPhase] = useState<CheckoutPhaseId>("connect_site")

  const site = (data?.sites ?? []).find((item) => item.id === siteId) ?? null
  const completed = useMemo(() => completedCheckoutSteps(data, site), [data, site])

  if (loading) {
    return <CheckoutHubSkeleton />
  }

  if (error || !data) {
    return (
      <Card>
        <CardContent className="space-y-3 p-6 text-sm">
          <p className="text-destructive">{COLLECTIONS_COPY.loadError}</p>
          <Button type="button" variant="outline" size="sm" onClick={() => void refetch()}>
            {COLLECTIONS_COPY.retry}
          </Button>
        </CardContent>
      </Card>
    )
  }

  if (flow === "edit" && Array.isArray(data.sites) && !site) {
    return (
      <Card>
        <CardContent className="space-y-3 p-6 text-sm">
          <p>{COLLECTIONS_COPY.siteNotFound}</p>
          <Button type="button" variant="outline" size="sm" asChild>
            <Link href="/checkout">{COLLECTIONS_COPY.siteNotFoundCta}</Link>
          </Button>
        </CardContent>
      </Card>
    )
  }

  const ready = data.readiness.ready
  const doneCount = CHECKOUT_PHASES.filter((item) => phaseComplete(item, completed)).length

  return (
    <div className="flex flex-col gap-8">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {COLLECTIONS_COPY.setupProgress} · {doneCount} {COLLECTIONS_COPY.of} {CHECKOUT_PHASES.length}
      </p>
      <div className="flex gap-2 overflow-x-auto pb-1 lg:hidden">
        {CHECKOUT_PHASES.map((item, index) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setPhase(item.id)}
            className={cn(
              "shrink-0 rounded-full border px-3.5 py-1.5 text-xs",
              phase === item.id ? "border-primary bg-primary/5 font-medium" : "text-muted-foreground",
            )}
          >
            {index + 1}. {PHASE_COPY[item.id].title}
          </button>
        ))}
      </div>

      <div className="grid gap-8 lg:grid-cols-[minmax(220px,260px)_minmax(0,1fr)] lg:items-start">
        <ul className="hidden lg:flex lg:flex-col lg:gap-2">
          {CHECKOUT_PHASES.map((item, index) => {
            const isDone = phaseComplete(item, completed)
            return (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => setPhase(item.id)}
                  className={cn(
                    "flex w-full items-start gap-3 rounded-lg px-3 py-3 text-left text-sm transition-colors",
                    phase === item.id ? "bg-muted font-medium" : "hover:bg-muted/60",
                  )}
                >
                  {isDone ? (
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
                  ) : (
                    <Circle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                  )}
                  <span className="leading-snug">
                    {index + 1}. {PHASE_COPY[item.id].title}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>

        <Card>
          <CardContent className="flex flex-col gap-10 p-6 sm:p-8">
            {CHECKOUT_PHASES.find((item) => item.id === phase)?.steps.map((step, index) => (
              <section
                key={step}
                className={cn(
                  "flex flex-col gap-5",
                  index > 0 && "border-t pt-10",
                  !ready && (step === "keys" || step === "live") && "opacity-70",
                )}
              >
                <StepBody
                  step={step}
                  data={data}
                  site={site}
                  onSaved={refetch}
                  onSiteCreated={(id) => router.replace(`/checkout/${id}`)}
                />
              </section>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

type HubDataProps = { data: CheckoutHubPayload; onSaved: () => void }
type SiteStepProps = HubDataProps & {
  site: CheckoutSite | null
  onSiteCreated: (id: string) => void
}

function StepBody({ step, data, site, onSaved, onSiteCreated }: SiteStepProps & { step: CheckoutStepId }) {
  switch (step) {
    case "website":
      return <StepWebsite data={data} site={site} onSaved={onSaved} onSiteCreated={onSiteCreated} />
    case "urls":
      return <StepUrls data={data} site={site} onSaved={onSaved} onSiteCreated={onSiteCreated} />
    case "keys":
      return <StepKeys data={data} onSaved={onSaved} />
    case "snippet":
      return <StepSnippet data={data} onSaved={onSaved} />
    case "session":
      return <StepSession site={site} />
    case "webhook":
      return <StepWebhook data={data} onSaved={onSaved} />
    case "test":
      return <StepTest />
    case "live":
      return <StepLive data={data} onSaved={onSaved} />
  }
}

function StepHeading({ title, blurb }: { title: string; blurb: string }) {
  return (
    <div className="space-y-1.5">
      <h2 className="text-lg font-semibold leading-snug text-foreground">{title}</h2>
      <p className="text-sm leading-relaxed text-muted-foreground">{blurb}</p>
    </div>
  )
}

function StepLearnMore({ children }: { children: ReactNode }) {
  return (
    <details className="text-sm text-muted-foreground">
      <summary className="cursor-pointer select-none">{COLLECTIONS_COPY.learnMore}</summary>
      <div className="mt-2 space-y-2">{children}</div>
    </details>
  )
}

function StepWebsite({ site, onSaved, onSiteCreated }: SiteStepProps) {
  const [origin, setOrigin] = useState(site?.origin ?? "")
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setOrigin(site?.origin ?? "")
  }, [site?.origin])

  const save = async () => {
    setSaving(true)
    try {
      if (site) {
        const result = await updateCheckoutSite(site.id, { origin })
        if (!result.ok) {
          toast.error(result.error || "Could not save")
          return
        }
        toast.success("Saved.")
        onSaved()
        return
      }
      const result = await createCheckoutSite({ origin })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success("Website added.")
      onSiteCreated(result.siteId)
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <StepHeading title={STEP_COPY.website.title} blurb={STEP_COPY.website.blurb} />
      <div className="space-y-2">
        <Label htmlFor="checkout-origin">Website</Label>
        <Input
          id="checkout-origin"
          value={origin}
          onChange={(e) => setOrigin(e.target.value)}
          placeholder="https://shop.yoursite.com"
          type="url"
        />
      </div>
      <Button type="button" disabled={saving || !origin.trim()} onClick={() => void save()}>
        {saving ? "Saving…" : site ? "Save website" : "Add website"}
      </Button>
    </>
  )
}

function StepUrls({ site, onSaved }: SiteStepProps) {
  const [successUrl, setSuccessUrl] = useState(site?.successUrl ?? "")
  const [cancelUrl, setCancelUrl] = useState(site?.cancelUrl ?? "")
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setSuccessUrl(site?.successUrl ?? "")
    setCancelUrl(site?.cancelUrl ?? "")
  }, [site?.successUrl, site?.cancelUrl])

  const save = async () => {
    if (!site) {
      toast.error("Save the website first.")
      return
    }
    setSaving(true)
    try {
      const result = await updateCheckoutSite(site.id, {
        success_url: successUrl,
        cancel_url: cancelUrl,
      })
      if (!result.ok) {
        toast.error(result.error || "Could not save")
        return
      }
      toast.success("Saved.")
      onSaved()
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <StepHeading title={STEP_COPY.urls.title} blurb={STEP_COPY.urls.blurb} />
      {!site ? (
        <p className="text-sm text-muted-foreground">Save the website first, then add return URLs.</p>
      ) : null}
      <div className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="checkout-success">Success URL</Label>
          <Input
            id="checkout-success"
            value={successUrl}
            onChange={(e) => setSuccessUrl(e.target.value)}
            placeholder="https://shop.yoursite.com/thanks?session_id={CHECKOUT_SESSION_ID}"
            disabled={!site}
          />
          <p className="text-xs text-muted-foreground">
            Easner replaces {"{CHECKOUT_SESSION_ID}"} so your page can look up the order.
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="checkout-cancel">Cancel URL</Label>
          <Input
            id="checkout-cancel"
            value={cancelUrl}
            onChange={(e) => setCancelUrl(e.target.value)}
            placeholder="https://shop.yoursite.com/cart"
            disabled={!site}
          />
        </div>
        <Button type="button" disabled={saving || !site} onClick={() => void save()}>
          {saving ? "Saving…" : "Save URLs"}
        </Button>
      </div>
    </>
  )
}

function StepKeys({ data, onSaved }: HubDataProps) {
  const [creating, setCreating] = useState<"test" | "live" | null>(null)
  const [revealed, setRevealed] = useState<{ mode: string; secretKey: string } | null>(null)

  const create = async (mode: "test" | "live") => {
    setCreating(mode)
    try {
      const res = await fetchWithSession("/api/checkout/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode }),
      })
      const body = (await res.json().catch(() => ({}))) as {
        secretKey?: string
        key?: CheckoutApiKey
        error?: string
      }
      if (!res.ok || !body.secretKey) {
        toast.error(body.error || "Could not create keys")
        return
      }
      setRevealed({ mode, secretKey: body.secretKey })
      onSaved()
    } finally {
      setCreating(null)
    }
  }

  return (
    <>
      <StepHeading title={STEP_COPY.keys.title} blurb={STEP_COPY.keys.blurb} />

      <div className="grid gap-4">
        {(["test", "live"] as const).map((mode) => {
          const key = data.keys.find((item) => item.mode === mode)
          return (
            <div key={mode} className="flex flex-col gap-4 rounded-xl border bg-muted/20 p-4 sm:p-5">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium capitalize text-foreground">{mode} keys</p>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={creating !== null}
                  onClick={() => void create(mode)}
                >
                  {creating === mode ? "Creating…" : key ? "Rotate" : "Create"}
                </Button>
              </div>
              {key ? (
                <div className="flex flex-col gap-3">
                  <CheckoutCodeBlock label="Publishable key (browser)" code={key.publishable_key} />
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    Secret key ending {key.secret_key_last4} – rotate to get a new one.
                  </p>
                </div>
              ) : (
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {mode === "live"
                    ? "Create live keys when you are ready to take real payments."
                    : "Start with test keys while you build."}
                </p>
              )}
              {revealed?.mode === mode ? (
                <RevealOnceValue
                  value={revealed.secretKey}
                  note="Store it in your server environment. Easner keeps only a fingerprint."
                />
              ) : null}
            </div>
          )
        })}
      </div>
    </>
  )
}

function StepSnippet({ data }: HubDataProps) {
  const publishableKey =
    data.keys.find((key) => key.mode === "test")?.publishable_key ?? "easner_pk_test_…"

  return (
    <>
      <StepHeading title={STEP_COPY.snippet.title} blurb={STEP_COPY.snippet.blurb} />
      <CheckoutCodeBlock
        label="On your checkout page"
        code={`<script src="https://js.easner.com/checkout.js"></script>
<div id="easner-checkout"></div>
<script>
  EasnerCheckout.mount("#easner-checkout", {
    publishableKey: "${publishableKey}",
    clientSecret: window.EASNER_CLIENT_SECRET,
  });
</script>`}
      />
      <StepLearnMore>
        <p>
          The client secret comes from the next step and is never hardcoded. You can pass an
          appearance object to match your colours and fonts.
        </p>
      </StepLearnMore>
    </>
  )
}

function StepSession({ site }: { site: CheckoutSite | null }) {
  const successUrl =
    site?.successUrl || "https://shop.yoursite.com/thanks?session_id={CHECKOUT_SESSION_ID}"
  const cancelUrl = site?.cancelUrl || "https://shop.yoursite.com/cart"
  return (
    <>
      <StepHeading title={STEP_COPY.session.title} blurb={STEP_COPY.session.blurb} />
      <CheckoutCodeBlock
        label="POST /v1/checkout/sessions"
        code={`curl https://api.easner.com/v1/checkout/sessions \\
  -H "Authorization: Bearer easner_sk_test_…" \\
  -H "Content-Type: application/json" \\
  -d '{
    "mode": "payment",
    "amount": 4900,
    "currency": "usd",
    "line_items": [{ "name": "Pro plan", "amount": 4900 }],
    "customer_email": "buyer@example.com",
    "success_url": "${successUrl}",
    "cancel_url": "${cancelUrl}"
  }'`}
      />
      <StepLearnMore>
        <p>
          The response contains a client_secret – pass it to the snippet. For a recurring charge use
          mode &quot;subscription&quot; with interval &quot;month&quot; or &quot;year&quot;.
        </p>
      </StepLearnMore>
    </>
  )
}

function StepWebhook({ data, onSaved }: HubDataProps) {
  const savedUrl = data.settings.webhookUrl ?? ""
  const [editing, setEditing] = useState(!savedUrl)
  const [url, setUrl] = useState(savedUrl)
  const [saving, setSaving] = useState(false)
  const [rotating, setRotating] = useState(false)
  const [testing, setTesting] = useState(false)
  const [rotateOpen, setRotateOpen] = useState(false)
  const [secret, setSecret] = useState<string | null>(null)
  const [lastTest, setLastTest] = useState<string | null>(null)
  const hasSecret = Boolean(data.settings.webhookSecretLast4)

  useEffect(() => {
    if (!editing) setUrl(savedUrl)
  }, [savedUrl, editing])

  const saveUrl = async () => {
    setSaving(true)
    try {
      const result = await saveCheckoutSettings({ webhook_url: url })
      if (!result.ok) {
        toast.error(result.error || "Could not save")
        return
      }
      toast.success("Saved.")
      setEditing(false)
      onSaved()
    } finally {
      setSaving(false)
    }
  }

  const rotateSecret = async () => {
    setRotating(true)
    try {
      const result = await saveCheckoutSettings({ rotate_webhook_secret: true })
      if (!result.ok) {
        toast.error(result.error || "Could not rotate the secret")
        return
      }
      if (result.webhookSecret) setSecret(result.webhookSecret)
      toast.success(hasSecret ? "Signing secret rotated." : "Signing secret created.")
      setRotateOpen(false)
      onSaved()
    } finally {
      setRotating(false)
    }
  }

  const sendTest = async () => {
    setTesting(true)
    try {
      const res = await fetchWithSession("/api/checkout/webhook-test", { method: "POST" })
      const body = (await res.json().catch(() => ({}))) as { error?: string; status?: number }
      if (!res.ok) {
        toast.error(body.error || "Test delivery failed")
        setLastTest(null)
        return
      }
      const message = `Your endpoint replied ${body.status ?? 200}.`
      setLastTest(message)
      toast.success(message)
    } finally {
      setTesting(false)
    }
  }

  return (
    <>
      <StepHeading title={STEP_COPY.webhook.title} blurb={STEP_COPY.webhook.blurb} />

      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Label htmlFor="checkout-webhook" className="mb-0">
            Endpoint URL
          </Label>
          {editing ? (
            <div className="flex items-center gap-2">
              {savedUrl ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={saving}
                  onClick={() => {
                    setUrl(savedUrl)
                    setEditing(false)
                  }}
                >
                  <X className="mr-1 h-4 w-4" aria-hidden />
                  Cancel
                </Button>
              ) : null}
              <Button type="button" size="sm" disabled={saving} onClick={() => void saveUrl()}>
                {saving ? (
                  <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  <Check className="mr-1 h-4 w-4" aria-hidden />
                )}
                Save
              </Button>
            </div>
          ) : (
            <Button type="button" variant="outline" size="sm" onClick={() => setEditing(true)}>
              <Edit className="mr-1 h-4 w-4" aria-hidden />
              Edit
            </Button>
          )}
        </div>
        <Input
          id="checkout-webhook"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://shop.yoursite.com/webhooks/easner"
          disabled={!editing}
          className="font-mono text-xs"
        />
        {!savedUrl && editing ? (
          <p className="text-xs text-muted-foreground">Save an https:// URL your server can receive.</p>
        ) : null}
      </div>

      <div className="flex flex-col gap-3 rounded-xl border p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <p className="text-sm font-medium text-foreground">Signing secret</p>
            <p className="text-xs text-muted-foreground">
              {data.settings.webhookSecretLast4
                ? `Ending ${data.settings.webhookSecretLast4}. Use it to verify the Easner-Signature header.`
                : "Create a secret before you verify events on your server."}
            </p>
          </div>
          {hasSecret ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={rotating}
              onClick={() => setRotateOpen(true)}
            >
              Rotate
            </Button>
          ) : (
            <Button type="button" size="sm" disabled={rotating} onClick={() => void rotateSecret()}>
              {rotating ? "Creating…" : "Create"}
            </Button>
          )}
        </div>
        {secret ? (
          <RevealOnceValue
            value={secret}
            note="Use it to verify the Easner-Signature header on every event."
          />
        ) : null}
      </div>

      <div className="flex flex-col gap-3 rounded-xl border p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <p className="text-sm font-medium text-foreground">Test delivery</p>
            <p className="text-xs text-muted-foreground">
              Sends a signed event to the saved endpoint. Does not charge a card.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={testing || !savedUrl}
            onClick={() => void sendTest()}
          >
            {testing ? "Sending…" : "Send test"}
          </Button>
        </div>
        {lastTest ? <p className="text-xs text-muted-foreground">{lastTest}</p> : null}
        {!savedUrl ? (
          <p className="text-xs text-muted-foreground">Save an endpoint before sending a test.</p>
        ) : null}
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium text-foreground">Events you can listen for</p>
        <ul className="space-y-2">
          {Object.entries(data.webhookEvents).map(([event, description]) => (
            <li key={event} className="text-sm">
              <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{event}</code>{" "}
              <span className="text-muted-foreground">{description}</span>
            </li>
          ))}
        </ul>
      </div>

      <AlertDialog open={rotateOpen} onOpenChange={setRotateOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Rotate signing secret?</AlertDialogTitle>
            <AlertDialogDescription>
              The current secret stops working immediately. Copy the new one and update your server
              before events fail to verify.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={rotating}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={rotating}
              onClick={(event) => {
                event.preventDefault()
                void rotateSecret()
              }}
            >
              {rotating ? "Rotating…" : "Rotate secret"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

function StepTest() {
  return (
    <>
      <StepHeading title={STEP_COPY.test.title} blurb={STEP_COPY.test.blurb} />
      <p className="text-sm text-muted-foreground">
        Use the test keys from Integrate on a website you added, then pay with card{" "}
        <code className="rounded bg-muted px-1.5 py-0.5 text-xs">4242 4242 4242 4242</code>, any
        future expiry, and any security code.
      </p>
      <p className="text-sm text-muted-foreground">
        A successful test shows on{" "}
        <Link href="/transactions" className="underline underline-offset-2">
          Transactions
        </Link>
        . Use Test delivery in Webhook if you only need to confirm the endpoint.
      </p>
    </>
  )
}

function StepLive({ data, onSaved }: HubDataProps) {
  const [saving, setSaving] = useState(false)

  const toggle = async (next: boolean) => {
    setSaving(true)
    try {
      const result = await saveCheckoutSettings({ live_mode_enabled: next })
      if (!result.ok) {
        toast.error(result.error || "Could not save")
        return
      }
      toast.success(next ? "Live payments on." : "Live payments off.")
      onSaved()
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <StepHeading title={STEP_COPY.live.title} blurb={STEP_COPY.live.blurb} />
      <div className="flex items-center justify-between gap-4 rounded-xl border p-4 sm:p-5">
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">Live payments</p>
          <p className="text-xs text-muted-foreground">
            {data.readiness.ready
              ? "Your account can take real payments."
              : "Complete verification first."}
          </p>
        </div>
        <Switch
          checked={data.settings.liveModeEnabled}
          disabled={saving || !data.readiness.ready}
          onCheckedChange={(next) => void toggle(next)}
          aria-label="Live payments"
        />
      </div>
      {data.keys.some((key) => key.mode === "live") ? null : (
        <p className="text-xs text-muted-foreground">
          Create live keys before switching your website over.
        </p>
      )}
    </>
  )
}


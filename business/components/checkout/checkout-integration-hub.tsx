"use client"

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import Link from "next/link"
import { toast } from "sonner"
import { Check, Circle, Plus, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import {
  CheckoutCodeBlock,
  RevealOnceValue,
} from "@/components/checkout/checkout-code-block"
import { CheckoutDashboardPanel } from "@/components/checkout/checkout-dashboard-panel"
import { CheckoutHubSkeleton } from "@/components/collections/collections-skeletons"
import {
  EasnerPaymentElementCheckout,
  PaymentFormSkeleton,
} from "@/components/checkout/easner-payment-element-checkout"
import {
  saveCheckoutSettings,
  useCheckoutSettings,
  type CheckoutApiKey,
  type CheckoutHubPayload,
} from "@/hooks/use-checkout-settings"
import { fetchWithSession } from "@/lib/fetch-with-session"
import {
  checkoutFeeModeDescription,
  checkoutFeeModeLabel,
} from "@/lib/stripe/checkout-fee-mode"
import { COLLECTIONS_COPY } from "@/lib/copy/business-ui-copy"
import {
  CHECKOUT_PHASES,
  checkoutSetupComplete,
  completedCheckoutSteps,
  firstIncompletePhase,
  phaseComplete,
  type CheckoutPhaseId,
  type CheckoutStepId,
} from "@/lib/checkout/checkout-phases"
import { cn } from "@/lib/utils"

const PHASE_COPY: Record<CheckoutPhaseId, { title: string; blurb: string }> = {
  get_ready: { title: COLLECTIONS_COPY.phaseGetReady, blurb: COLLECTIONS_COPY.phaseGetReadyBlurb },
  connect_site: { title: COLLECTIONS_COPY.phaseConnect, blurb: COLLECTIONS_COPY.phaseConnectBlurb },
  integrate: { title: COLLECTIONS_COPY.phaseIntegrate, blurb: COLLECTIONS_COPY.phaseIntegrateBlurb },
  verify: { title: COLLECTIONS_COPY.phaseVerify, blurb: COLLECTIONS_COPY.phaseVerifyBlurb },
}

const STEP_COPY: Record<CheckoutStepId, { title: string; blurb: string }> = {
  ready: { title: COLLECTIONS_COPY.stepReadyTitle, blurb: COLLECTIONS_COPY.stepReadyBlurb },
  fees: { title: COLLECTIONS_COPY.stepFeesTitle, blurb: COLLECTIONS_COPY.stepFeesBlurb },
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
  forceSetup = false,
  onDashboardReady,
}: {
  forceSetup?: boolean
  onDashboardReady?: (ready: boolean) => void
}) {
  const { data, loading, error, refetch } = useCheckoutSettings()
  const [phase, setPhase] = useState<CheckoutPhaseId>("get_ready")
  const [editing, setEditing] = useState(forceSetup)
  const primedPhase = useRef(false)

  const completed = useMemo(() => completedCheckoutSteps(data), [data])
  const dashboardReady = checkoutSetupComplete(data) && !editing && !forceSetup

  useEffect(() => {
    if (!data || primedPhase.current) return
    primedPhase.current = true
    setPhase(firstIncompletePhase(data))
  }, [data])

  useEffect(() => {
    onDashboardReady?.(dashboardReady)
  }, [dashboardReady, onDashboardReady])

  if (loading && !data) {
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

  const ready = data.readiness.ready
  const doneCount = CHECKOUT_PHASES.filter((item) => phaseComplete(item, completed)).length

  if (dashboardReady) {
    return (
      <div className="space-y-6">
        <CheckoutDashboardPanel
          data={data}
          onEdit={() => setEditing(true)}
          onTest={() => {
            setEditing(true)
            setPhase("verify")
          }}
        />
        <p className="text-sm text-muted-foreground">
          {COLLECTIONS_COPY.notBuildingSite}{" "}
          <Link href="/links" className="underline underline-offset-2">
            {COLLECTIONS_COPY.openPaymentLinks}
          </Link>
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {COLLECTIONS_COPY.setupProgress} · {doneCount} {COLLECTIONS_COPY.of} {CHECKOUT_PHASES.length}
      </p>
      <div className="flex gap-2 overflow-x-auto lg:hidden">
        {CHECKOUT_PHASES.map((item, index) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setPhase(item.id)}
            className={cn(
              "shrink-0 rounded-full border px-3 py-1 text-xs",
              phase === item.id ? "border-primary bg-primary/5 font-medium" : "text-muted-foreground",
            )}
          >
            {index + 1}. {PHASE_COPY[item.id].title}
          </button>
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(200px,240px)_minmax(0,1fr)]">
        <ul className="hidden space-y-1 lg:block">
          {CHECKOUT_PHASES.map((item, index) => {
            const isDone = phaseComplete(item, completed)
            return (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => setPhase(item.id)}
                  className={cn(
                    "flex w-full items-start gap-2 rounded-md px-2 py-2 text-left text-sm transition-colors",
                    phase === item.id ? "bg-muted font-medium" : "hover:bg-muted/60",
                  )}
                >
                  {isDone ? (
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
                  ) : (
                    <Circle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                  )}
                  <span>
                    {index + 1}. {PHASE_COPY[item.id].title}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>

        <Card>
          <CardContent className="space-y-8 p-5">
            <p className="text-sm text-muted-foreground">{PHASE_COPY[phase].blurb}</p>
            {CHECKOUT_PHASES.find((item) => item.id === phase)?.steps.map((step) => (
              <div key={step} className={cn(!ready && (step === "keys" || step === "live") && "opacity-70")}>
                <StepBody step={step} data={data} onSaved={refetch} />
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <p className="text-sm text-muted-foreground">
        {COLLECTIONS_COPY.notBuildingSite}{" "}
        <Link href="/links" className="underline underline-offset-2">
          {COLLECTIONS_COPY.openPaymentLinks}
        </Link>
      </p>
    </div>
  )
}

type StepProps = { data: CheckoutHubPayload; onSaved: () => void }

function StepBody({ step, data, onSaved }: StepProps & { step: CheckoutStepId }) {
  switch (step) {
    case "ready":
      return <StepReady data={data} onSaved={onSaved} />
    case "fees":
      return <StepFees data={data} onSaved={onSaved} />
    case "website":
      return <StepWebsite data={data} onSaved={onSaved} />
    case "urls":
      return <StepUrls data={data} onSaved={onSaved} />
    case "keys":
      return <StepKeys data={data} onSaved={onSaved} />
    case "snippet":
      return <StepSnippet data={data} onSaved={onSaved} />
    case "session":
      return <StepSession />
    case "webhook":
      return <StepWebhook data={data} onSaved={onSaved} />
    case "test":
      return <StepTest data={data} onSaved={onSaved} />
    case "live":
      return <StepLive data={data} onSaved={onSaved} />
  }
}

function StepHeading({ title, blurb }: { title: string; blurb: string }) {
  return (
    <div className="space-y-1">
      <h2 className="text-base font-semibold text-foreground">{title}</h2>
      <p className="text-sm text-muted-foreground">{blurb}</p>
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

function StepReady({ data }: StepProps) {
  return (
    <>
      <StepHeading title={STEP_COPY.ready.title} blurb={STEP_COPY.ready.blurb} />
      {data.readiness.ready ? (
        <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-sm">
          <p className="font-medium text-foreground">Online payments are on</p>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          {data.readiness.reason || COLLECTIONS_COPY.setupTitle}{" "}
          <Link href="/settings?tab=payments" className="underline underline-offset-2">
            {COLLECTIONS_COPY.masterOffCta}
          </Link>
        </p>
      )}
    </>
  )
}

function StepFees({ data }: StepProps) {
  return (
    <>
      <StepHeading title={STEP_COPY.fees.title} blurb={STEP_COPY.fees.blurb} />
      <div className="rounded-lg border bg-muted/40 p-3 text-sm">
        <p className="font-medium text-foreground">
          Current setting — {checkoutFeeModeLabel(data.settings.feeMode)}
        </p>
        <p className="mt-1 text-muted-foreground">
          {data.settings.feeModeManagedByEasner
            ? checkoutFeeModeDescription(data.settings.feeMode)
            : "Fee mode is configured in Settings."}
        </p>
        <Link
          href="/settings?tab=payments"
          className="mt-3 inline-block text-sm underline underline-offset-2"
        >
          Open Payments settings
        </Link>
      </div>
    </>
  )
}

function StepWebsite({ data, onSaved }: StepProps) {
  const [origin, setOrigin] = useState("")
  const [saving, setSaving] = useState(false)

  const save = async (origins: string[]) => {
    setSaving(true)
    try {
      const result = await saveCheckoutSettings({ allowed_origins: origins })
      if (!result.ok) {
        toast.error(result.error || "Could not save")
        return
      }
      setOrigin("")
      onSaved()
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <StepHeading title={STEP_COPY.website.title} blurb={STEP_COPY.website.blurb} />
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          value={origin}
          onChange={(e) => setOrigin(e.target.value)}
          placeholder="https://shop.yoursite.com"
          type="url"
        />
        <Button
          type="button"
          className="gap-2"
          disabled={saving || !origin.trim()}
          onClick={() => void save([...data.settings.allowedOrigins, origin.trim()])}
        >
          <Plus className="h-4 w-4" aria-hidden />
          Add
        </Button>
      </div>
      {data.settings.allowedOrigins.length === 0 ? (
        <p className="text-xs text-muted-foreground">No websites added yet.</p>
      ) : (
        <ul className="space-y-1">
          {data.settings.allowedOrigins.map((value) => (
            <li
              key={value}
              className="flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm"
            >
              <span className="min-w-0 truncate font-mono text-xs">{value}</span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0"
                aria-label={`Remove ${value}`}
                disabled={saving}
                onClick={() =>
                  void save(data.settings.allowedOrigins.filter((item) => item !== value))
                }
              >
                <X className="h-3.5 w-3.5" aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

function StepUrls({ data, onSaved }: StepProps) {
  const [successUrl, setSuccessUrl] = useState(data.settings.defaultSuccessUrl ?? "")
  const [cancelUrl, setCancelUrl] = useState(data.settings.defaultCancelUrl ?? "")
  const [saving, setSaving] = useState(false)

  const save = async () => {
    setSaving(true)
    try {
      const result = await saveCheckoutSettings({
        default_success_url: successUrl,
        default_cancel_url: cancelUrl,
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
      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="checkout-success">Success URL</Label>
          <Input
            id="checkout-success"
            value={successUrl}
            onChange={(e) => setSuccessUrl(e.target.value)}
            placeholder="https://shop.yoursite.com/thanks?session_id={CHECKOUT_SESSION_ID}"
          />
          <p className="text-xs text-muted-foreground">
            Easner replaces {"{CHECKOUT_SESSION_ID}"} so your page can look up the order.
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="checkout-cancel">Cancel URL</Label>
          <Input
            id="checkout-cancel"
            value={cancelUrl}
            onChange={(e) => setCancelUrl(e.target.value)}
            placeholder="https://shop.yoursite.com/cart"
          />
        </div>
        <Button type="button" disabled={saving} onClick={() => void save()}>
          {saving ? "Saving…" : "Save URLs"}
        </Button>
      </div>
    </>
  )
}

function StepKeys({ data, onSaved }: StepProps) {
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

      {(["test", "live"] as const).map((mode) => {
        const key = data.keys.find((item) => item.mode === mode)
        return (
          <div key={mode} className="space-y-2 rounded-lg border p-3">
            <div className="flex items-center justify-between gap-2">
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
              <div className="space-y-2">
                <CheckoutCodeBlock label="Publishable key (browser)" code={key.publishable_key} />
                <p className="text-xs text-muted-foreground">
                  Secret key ending {key.secret_key_last4} — rotate to get a new one.
                </p>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
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
    </>
  )
}

function StepSnippet({ data }: StepProps) {
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

function StepSession() {
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
    "success_url": "https://shop.yoursite.com/thanks?session_id={CHECKOUT_SESSION_ID}",
    "cancel_url": "https://shop.yoursite.com/cart"
  }'`}
      />
      <StepLearnMore>
        <p>
          The response contains a client_secret — pass it to the snippet. For a recurring charge use
          mode &quot;subscription&quot; with interval &quot;month&quot; or &quot;year&quot;.
        </p>
      </StepLearnMore>
    </>
  )
}

function StepWebhook({ data, onSaved }: StepProps) {
  const [url, setUrl] = useState(data.settings.webhookUrl ?? "")
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [secret, setSecret] = useState<string | null>(null)

  const save = async (rotate: boolean) => {
    setSaving(true)
    try {
      const result = await saveCheckoutSettings({
        webhook_url: url,
        ...(rotate ? { rotate_webhook_secret: true } : {}),
      })
      if (!result.ok) {
        toast.error(result.error || "Could not save")
        return
      }
      if (result.webhookSecret) setSecret(result.webhookSecret)
      toast.success("Saved.")
      onSaved()
    } finally {
      setSaving(false)
    }
  }

  const sendTest = async () => {
    setTesting(true)
    try {
      const res = await fetchWithSession("/api/checkout/webhook-test", { method: "POST" })
      const body = (await res.json().catch(() => ({}))) as { error?: string; status?: number }
      if (!res.ok) {
        toast.error(body.error || "Test delivery failed")
        return
      }
      toast.success(`Your endpoint replied ${body.status ?? 200}.`)
    } finally {
      setTesting(false)
    }
  }

  return (
    <>
      <StepHeading title={STEP_COPY.webhook.title} blurb={STEP_COPY.webhook.blurb} />
      <div className="space-y-1.5">
        <Label htmlFor="checkout-webhook">Endpoint URL</Label>
        <Input
          id="checkout-webhook"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://shop.yoursite.com/webhooks/easner"
        />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" disabled={saving} onClick={() => void save(false)}>
          {saving ? "Saving…" : "Save endpoint"}
        </Button>
        <Button type="button" variant="outline" disabled={saving} onClick={() => void save(true)}>
          {data.settings.webhookSecretLast4 ? "Rotate signing secret" : "Create signing secret"}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={testing || !data.settings.webhookUrl}
          onClick={() => void sendTest()}
        >
          {testing ? "Sending…" : "Send test event"}
        </Button>
      </div>

      {secret ? (
        <RevealOnceValue
          value={secret}
          note="Use it to verify the Easner-Signature header on every event."
        />
      ) : data.settings.webhookSecretLast4 ? (
        <p className="text-xs text-muted-foreground">
          Signing secret ending {data.settings.webhookSecretLast4}.
        </p>
      ) : null}

      <div className="space-y-2">
        <p className="text-sm font-medium text-foreground">Events you can listen for</p>
        <ul className="space-y-1">
          {Object.entries(data.webhookEvents).map(([event, description]) => (
            <li key={event} className="text-sm">
              <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{event}</code>{" "}
              <span className="text-muted-foreground">{description}</span>
            </li>
          ))}
        </ul>
      </div>
    </>
  )
}

function StepTest({ data, onSaved }: StepProps) {
  const [session, setSession] = useState<{ clientSecret: string; amountCents: number } | null>(null)
  const [starting, setStarting] = useState(false)

  const start = async () => {
    setStarting(true)
    try {
      const res = await fetchWithSession("/api/checkout/test-session", { method: "POST" })
      const body = (await res.json().catch(() => ({}))) as {
        clientSecret?: string
        amountCents?: number
        error?: string
      }
      if (!res.ok || !body.clientSecret) {
        toast.error(body.error || "Could not start the test payment")
        return
      }
      setSession({ clientSecret: body.clientSecret, amountCents: body.amountCents ?? 100 })
    } finally {
      setStarting(false)
    }
  }

  const markComplete = async () => {
    await saveCheckoutSettings({ test_payment_completed: true })
    onSaved()
  }

  return (
    <>
      <StepHeading title={STEP_COPY.test.title} blurb={STEP_COPY.test.blurb} />
      <p className="text-sm text-muted-foreground">
        Card <code className="rounded bg-muted px-1.5 py-0.5 text-xs">4242 4242 4242 4242</code>,
        any future expiry, any security code.
      </p>
      {session ? (
        <EasnerPaymentElementCheckout
          clientSecret={session.clientSecret}
          amount={session.amountCents / 100}
          currency="USD"
          successMessage="Test payment received. It appears on Transactions as an Online Checkout payment."
          onPaid={() => void markComplete()}
        />
      ) : starting ? (
        <PaymentFormSkeleton />
      ) : (
        <Button type="button" onClick={() => void start()}>
          Start test payment
        </Button>
      )}
      {data.settings.testPaymentCompletedAt ? (
        <p className="text-xs text-muted-foreground">
          You already completed a test payment. Run another any time.
        </p>
      ) : null}
    </>
  )
}

function StepLive({ data, onSaved }: StepProps) {
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
      <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
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


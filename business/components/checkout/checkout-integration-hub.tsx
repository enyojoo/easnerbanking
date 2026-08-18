"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { toast } from "sonner"
import { Check, Circle, Loader2, Plus, X } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import {
  CheckoutCodeBlock,
  RevealOnceValue,
} from "@/components/checkout/checkout-code-block"
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
  BUSINESS_SELECTABLE_FEE_MODES,
  checkoutFeeModeDescription,
  checkoutFeeModeLabel,
  type CheckoutFeeMode,
} from "@/lib/stripe/checkout-fee-mode"
import { cn } from "@/lib/utils"

type StepId =
  | "ready"
  | "fees"
  | "website"
  | "urls"
  | "keys"
  | "snippet"
  | "session"
  | "webhook"
  | "test"
  | "live"

const STEP_TITLES: Record<StepId, string> = {
  ready: "Confirm online payments are on",
  fees: "Choose who pays the processing fee",
  website: "Add your website",
  urls: "Set success and cancel URLs",
  keys: "Get API keys",
  snippet: "Add the payment form to your page",
  session: "Create a session from your server",
  webhook: "Add a webhook",
  test: "Make a test payment",
  live: "Go live",
}

const STEP_ORDER: StepId[] = [
  "ready",
  "fees",
  "website",
  "urls",
  "keys",
  "snippet",
  "session",
  "webhook",
  "test",
  "live",
]

const GATED_STEPS = new Set<StepId>(["keys", "snippet", "session", "webhook", "test", "live"])

export function CheckoutIntegrationHub() {
  const { data, loading, error, refetch } = useCheckoutSettings()
  const [step, setStep] = useState<StepId>("ready")

  const completed = useMemo(() => completedSteps(data), [data])

  if (loading && !data) {
    return (
      <Card>
        <CardContent className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          Loading your checkout setup…
        </CardContent>
      </Card>
    )
  }

  if (error || !data) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-destructive">
          {error || "Could not load checkout settings"}
        </CardContent>
      </Card>
    )
  }

  const ready = data.readiness.ready

  return (
    <div className="flex flex-col gap-6">
      {!ready ? (
        <div className="rounded-lg border border-amber-200/80 bg-amber-50/80 p-4 text-sm text-amber-950 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-100">
          <p className="font-medium">Online payments are not on yet</p>
          <p className="mt-1">
            {data.readiness.reason ||
              "Complete verification so you can accept card and bank payments."}{" "}
            <Link href="/settings?tab=verification" className="underline underline-offset-2">
              Go to verification
            </Link>
          </p>
          <p className="mt-1 text-xs">
            Keys, the snippet, webhooks, and live mode appear here once you are ready.
          </p>
        </div>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-[minmax(240px,280px)_minmax(0,1fr)]">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Setup — {completed.size} of {STEP_ORDER.length} complete
          </p>
          <ul className="space-y-1">
            {STEP_ORDER.map((id, index) => {
              const isLocked = !ready && GATED_STEPS.has(id)
              const isDone = completed.has(id)
              return (
                <li key={id}>
                  <button
                    type="button"
                    disabled={isLocked}
                    onClick={() => setStep(id)}
                    className={cn(
                      "flex w-full items-start gap-2 rounded-md px-2 py-2 text-left text-sm transition-colors",
                      step === id ? "bg-muted font-medium" : "hover:bg-muted/60",
                      isLocked && "cursor-not-allowed opacity-50",
                    )}
                  >
                    {isDone ? (
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
                    ) : (
                      <Circle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                    )}
                    <span className="min-w-0">
                      {index + 1}. {STEP_TITLES[id]}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        </div>

        <Card>
          <CardContent className="space-y-4 p-5">
            <StepBody step={step} data={data} onSaved={refetch} />
          </CardContent>
        </Card>
      </div>

      <WhoDoesWhat />
    </div>
  )
}

function completedSteps(data: CheckoutHubPayload | null): Set<StepId> {
  const done = new Set<StepId>()
  if (!data) return done
  if (data.readiness.ready) done.add("ready")
  if (data.settings.businessFeeMode || data.settings.feeModeManagedByEasner) done.add("fees")
  if (data.settings.allowedOrigins.length > 0) done.add("website")
  if (data.settings.defaultSuccessUrl) done.add("urls")
  if (data.keys.length > 0) {
    done.add("keys")
    // The snippet and server call are proven by a real session, which the test step covers.
    done.add("snippet")
    done.add("session")
  }
  if (data.settings.webhookUrl && data.settings.webhookSecretLast4) done.add("webhook")
  if (data.settings.testPaymentCompletedAt) done.add("test")
  if (data.settings.liveModeEnabled) done.add("live")
  return done
}

type StepProps = { data: CheckoutHubPayload; onSaved: () => void }

function StepBody({ step, data, onSaved }: StepProps & { step: StepId }) {
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

function StepReady({ data }: StepProps) {
  return (
    <>
      <StepHeading
        title="Confirm online payments"
        blurb="Card and bank payments use the same setup as invoice Pay online — there is nothing extra to sign up for here."
      />
      {data.readiness.ready ? (
        <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-sm">
          <p className="font-medium text-foreground">Online payments are on</p>
          <p className="mt-1 text-muted-foreground">
            Invoices, Payment Links, and your website all collect through the same setup, and money
            settles into your Easner Balance.
          </p>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          {data.readiness.reason || "Complete verification in Settings to switch this on."}{" "}
          <Link href="/settings?tab=verification" className="underline underline-offset-2">
            Go to verification
          </Link>
        </p>
      )}
    </>
  )
}

function StepFees({ data, onSaved }: StepProps) {
  const [saving, setSaving] = useState(false)
  const managed = data.settings.feeModeManagedByEasner

  const choose = async (feeMode: CheckoutFeeMode) => {
    setSaving(true)
    try {
      const result = await saveCheckoutSettings({ fee_mode: feeMode })
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
      <StepHeading
        title="Choose who pays the processing fee"
        blurb="Applies to every online payment you collect: invoices, links, and your website."
      />
      {managed ? (
        <div className="rounded-lg border bg-muted/40 p-3 text-sm">
          <p className="font-medium text-foreground">
            Managed by Easner — {checkoutFeeModeLabel(data.settings.feeMode)}
          </p>
          <p className="mt-1 text-muted-foreground">
            {checkoutFeeModeDescription(data.settings.feeMode)}
          </p>
        </div>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {BUSINESS_SELECTABLE_FEE_MODES.map((mode) => (
            <button
              key={mode}
              type="button"
              disabled={saving}
              onClick={() => void choose(mode)}
              className={cn(
                "rounded-lg border p-3 text-left transition-colors",
                data.settings.feeMode === mode
                  ? "border-primary bg-primary/5"
                  : "border-border hover:bg-muted/50",
                saving && "opacity-60",
              )}
              aria-pressed={data.settings.feeMode === mode}
            >
              <span className="block text-sm font-medium text-foreground">
                {checkoutFeeModeLabel(mode)}
              </span>
              <span className="mt-1 block text-xs text-muted-foreground">
                {checkoutFeeModeDescription(mode)}
              </span>
            </button>
          ))}
        </div>
      )}
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
      <StepHeading
        title="Add your website"
        blurb="Only these addresses can take payments with your keys, so a stolen key cannot run checkout somewhere else. Add both www and the bare domain if you use both."
      />
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
      <StepHeading
        title="Set success and cancel URLs"
        blurb="Where customers land after paying, or if they back out. Your server can override these per payment."
      />
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
      <StepHeading
        title="Get API keys"
        blurb="The publishable key is safe in your page. The secret key stays on your server and only creates checkout sessions — it can never move money out of your account."
      />

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
      <StepHeading
        title="Add the payment form to your page"
        blurb="Your page keeps your own design. Only the card and bank fields come from Easner."
      />
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
      <p className="text-xs text-muted-foreground">
        The client secret comes from the next step and is never hardcoded. You can pass an
        appearance object to match your colours and fonts.
      </p>
    </>
  )
}

function StepSession() {
  return (
    <>
      <StepHeading
        title="Create a session from your server"
        blurb="When a customer clicks Pay, your server asks Easner for a session. Amounts are set server-side so a browser cannot change the price."
      />
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
      <p className="text-xs text-muted-foreground">
        The response contains a client_secret — pass it to the snippet. For a recurring charge use
        mode &quot;subscription&quot; with interval &quot;month&quot; or &quot;year&quot;.
      </p>
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
      <StepHeading
        title="Add a webhook"
        blurb="Do not fulfil orders from the browser — a customer can close the tab. Easner posts signed events to your server instead."
      />
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
      <StepHeading
        title="Make a test payment"
        blurb="This is the same form your customers will see, running here in Easner. Use test keys and a test card — nothing is charged."
      />
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
      <StepHeading
        title="Go live"
        blurb="Swap the test keys in your page and server for live keys. Real payments settle into your Easner Balance the same way test ones do."
      />
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
          Create live keys in step 5 before switching your website over.
        </p>
      )}
    </>
  )
}

function WhoDoesWhat() {
  return (
    <div className="space-y-3">
      <h2 className="text-base font-semibold text-foreground">Who does what</h2>
      <div className="grid gap-3 md:grid-cols-3">
        {[
          {
            title: "Your website",
            body: "Products, cart, prices, the Pay button, and your thank-you page. You decide the amount before calling Easner.",
          },
          {
            title: "This screen",
            body: "Your website addresses, return URLs, keys, the snippet, and webhooks — all in one place.",
          },
          {
            title: "Easner",
            body: "Creates the payment, collects the money, and settles it into your Easner Balance.",
          },
        ].map((card) => (
          <Card key={card.title}>
            <CardContent className="space-y-1 p-4">
              <p className="text-sm font-medium text-foreground">{card.title}</p>
              <p className="text-sm text-muted-foreground">{card.body}</p>
            </CardContent>
          </Card>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        Need a link to share instead of a website integration?{" "}
        <Link href="/links" className="underline underline-offset-2">
          Payment Links
        </Link>{" "}
        live under Collections.
      </p>
    </div>
  )
}

export function CheckoutHubPills() {
  return (
    <div className="flex flex-wrap gap-2">
      <Badge variant="secondary">Card and bank</Badge>
      <Badge variant="secondary">Same setup as invoices</Badge>
      <Badge variant="secondary">Money lands in Easner Balance</Badge>
    </div>
  )
}

"use client"

import { useEffect, useMemo, useState, type ReactNode } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Check, Circle, Edit, Loader2, Plus, X } from "lucide-react"
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
import { CheckoutTestPaymentsDialog } from "@/components/checkout/checkout-test-payments-dialog"
import { fetchWithSession } from "@/lib/fetch-with-session"
import type { WebhookDelivery } from "@/lib/checkout/hub-types"
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
  branding: { title: COLLECTIONS_COPY.stepBrandingTitle, blurb: COLLECTIONS_COPY.stepBrandingBlurb },
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
    case "branding":
      return <StepBranding data={data} onSaved={onSaved} />
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

function FieldEditControls({
  editing,
  saving,
  hasSaved,
  onEdit,
  onCancel,
  onSave,
  saveDisabled,
}: {
  editing: boolean
  saving: boolean
  hasSaved: boolean
  onEdit: () => void
  onCancel: () => void
  onSave: () => void
  saveDisabled?: boolean
}) {
  if (!hasSaved) {
    return (
      <Button type="button" size="sm" disabled={saving || saveDisabled} onClick={onSave}>
        {saving ? (
          <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden />
        ) : (
          <Plus className="mr-1 h-4 w-4" aria-hidden />
        )}
        Add
      </Button>
    )
  }
  if (editing) {
    return (
      <div className="flex items-center gap-2">
        <Button type="button" variant="outline" size="sm" disabled={saving} onClick={onCancel}>
          <X className="mr-1 h-4 w-4" aria-hidden />
          Cancel
        </Button>
        <Button type="button" size="sm" disabled={saving || saveDisabled} onClick={onSave}>
          {saving ? (
            <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <Check className="mr-1 h-4 w-4" aria-hidden />
          )}
          Save
        </Button>
      </div>
    )
  }
  return (
    <Button type="button" variant="outline" size="sm" onClick={onEdit}>
      <Edit className="mr-1 h-4 w-4" aria-hidden />
      Edit
    </Button>
  )
}

function StepWebsite({ site, onSaved, onSiteCreated }: SiteStepProps) {
  const saved = site?.origin ?? ""
  const [editing, setEditing] = useState(!saved)
  const [origin, setOrigin] = useState(saved)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setOrigin(saved)
    if (saved) setEditing(false)
  }, [saved])

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
        setEditing(false)
        onSaved()
        return
      }
      const result = await createCheckoutSite({ origin })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success("Website added.")
      setEditing(false)
      onSiteCreated(result.siteId)
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <StepHeading title={STEP_COPY.website.title} blurb={STEP_COPY.website.blurb} />
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Label htmlFor="checkout-origin" className="mb-0">
            Website
          </Label>
          <FieldEditControls
            editing={editing}
            saving={saving}
            hasSaved={Boolean(saved)}
            saveDisabled={!origin.trim()}
            onEdit={() => setEditing(true)}
            onCancel={() => {
              setOrigin(saved)
              setEditing(Boolean(!saved))
            }}
            onSave={() => void save()}
          />
        </div>
        <Input
          id="checkout-origin"
          value={origin}
          onChange={(e) => setOrigin(e.target.value)}
          placeholder="https://shop.yoursite.com"
          type="url"
          disabled={!editing}
        />
      </div>
    </>
  )
}

function StepUrls({ site, onSaved }: SiteStepProps) {
  const savedSuccess = site?.successUrl ?? ""
  const savedCancel = site?.cancelUrl ?? ""
  const [editingSuccess, setEditingSuccess] = useState(!savedSuccess)
  const [editingCancel, setEditingCancel] = useState(!savedCancel)
  const [successUrl, setSuccessUrl] = useState(savedSuccess)
  const [cancelUrl, setCancelUrl] = useState(savedCancel)
  const [savingSuccess, setSavingSuccess] = useState(false)
  const [savingCancel, setSavingCancel] = useState(false)

  useEffect(() => {
    setSuccessUrl(site?.successUrl ?? "")
    setEditingSuccess(!site?.successUrl)
  }, [site?.id])

  useEffect(() => {
    setCancelUrl(site?.cancelUrl ?? "")
    setEditingCancel(!site?.cancelUrl)
  }, [site?.id])

  const saveField = async (field: "success" | "cancel") => {
    if (!site) {
      toast.error("Save the website first.")
      return
    }
    const setSaving = field === "success" ? setSavingSuccess : setSavingCancel
    setSaving(true)
    try {
      const result = await updateCheckoutSite(site.id, {
        success_url: field === "success" ? successUrl : savedSuccess,
        cancel_url: field === "cancel" ? cancelUrl : savedCancel,
      })
      if (!result.ok) {
        toast.error(result.error || "Could not save")
        return
      }
      toast.success("Saved.")
      if (field === "success") setEditingSuccess(false)
      else setEditingCancel(false)
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
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Label htmlFor="checkout-success" className="mb-0">
              Success URL
            </Label>
            {site ? (
              <FieldEditControls
                editing={editingSuccess}
                saving={savingSuccess}
                hasSaved={Boolean(savedSuccess)}
                onEdit={() => setEditingSuccess(true)}
                onCancel={() => {
                  setSuccessUrl(savedSuccess)
                  setEditingSuccess(!savedSuccess)
                }}
                onSave={() => void saveField("success")}
              />
            ) : null}
          </div>
          <Input
            id="checkout-success"
            value={successUrl}
            onChange={(e) => setSuccessUrl(e.target.value)}
            placeholder="https://shop.yoursite.com/thanks?session_id={CHECKOUT_SESSION_ID}"
            disabled={!site || !editingSuccess}
          />
          <p className="text-xs text-muted-foreground">
            Easner replaces {"{CHECKOUT_SESSION_ID}"} so your page can look up the order.
          </p>
        </div>
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Label htmlFor="checkout-cancel" className="mb-0">
              Cancel URL
            </Label>
            {site ? (
              <FieldEditControls
                editing={editingCancel}
                saving={savingCancel}
                hasSaved={Boolean(savedCancel)}
                onEdit={() => setEditingCancel(true)}
                onCancel={() => {
                  setCancelUrl(savedCancel)
                  setEditingCancel(!savedCancel)
                }}
                onSave={() => void saveField("cancel")}
              />
            ) : null}
          </div>
          <Input
            id="checkout-cancel"
            value={cancelUrl}
            onChange={(e) => setCancelUrl(e.target.value)}
            placeholder="https://shop.yoursite.com/cart"
            disabled={!site || !editingCancel}
          />
        </div>
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

function StepBranding({ data, onSaved }: HubDataProps) {
  const saved = data.settings.branding ?? { brandColor: null, buttonRadius: "pill" as const }
  const [color, setColor] = useState(saved.brandColor ?? "")
  const [radius, setRadius] = useState<"pill" | "rounded">(saved.buttonRadius)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setColor(saved.brandColor ?? "")
    setRadius(saved.buttonRadius)
  }, [saved.brandColor, saved.buttonRadius])

  const previewColor = /^#[0-9a-fA-F]{6}$/.test(color) ? color : "#0080cc"
  const dirty = (color.trim() || null) !== (saved.brandColor ?? null) || radius !== saved.buttonRadius

  const save = async () => {
    if (color.trim() && !/^#[0-9a-fA-F]{6}$/.test(color.trim())) {
      toast.error("Enter the brand color as a hex value, like #0080cc")
      return
    }
    setSaving(true)
    try {
      const result = await saveCheckoutSettings({
        appearance: { brand_color: color.trim() || null, button_radius: radius },
      })
      if (!result.ok) {
        toast.error(result.error || "Could not save")
        return
      }
      toast.success("Saved. Every checkout on your site now uses it.")
      onSaved()
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <StepHeading title={STEP_COPY.branding.title} blurb={STEP_COPY.branding.blurb} />
      <div className="flex flex-col gap-5 rounded-xl border p-4 sm:p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="checkout-brand-color">Brand color</Label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                aria-label="Pick brand color"
                value={previewColor}
                onChange={(e) => setColor(e.target.value)}
                className="h-10 w-12 shrink-0 cursor-pointer rounded-md border bg-transparent p-1"
              />
              <Input
                id="checkout-brand-color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                placeholder="#0080cc"
                className="font-mono text-xs"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Leave empty to keep the Easner default.
            </p>
          </div>
          <div className="space-y-2">
            <Label>Corner style</Label>
            <div className="flex gap-2">
              {(["pill", "rounded"] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setRadius(option)}
                  className={cn(
                    "border px-4 py-2 text-sm transition-colors",
                    option === "pill" ? "rounded-full" : "rounded-lg",
                    radius === option
                      ? "border-primary bg-primary/5 font-medium"
                      : "text-muted-foreground hover:bg-muted/60",
                  )}
                >
                  {option === "pill" ? "Pill" : "Rounded"}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
          <div
            aria-hidden
            className="flex h-11 min-w-40 items-center justify-center px-6 text-sm font-semibold text-white"
            style={{
              background: previewColor,
              borderRadius: radius === "pill" ? "9999px" : "10px",
            }}
          >
            Pay $49.00
          </div>
          <Button type="button" size="sm" disabled={saving || !dirty} onClick={() => void save()}>
            {saving ? (
              <>
                <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden />
                Saving…
              </>
            ) : (
              "Save branding"
            )}
          </Button>
        </div>
      </div>
    </>
  )
}

function StepSnippet({ data }: HubDataProps) {
  const publishableKey =
    data.keys.find((key) => key.mode === "test")?.publishable_key ?? "easner_pk_test_…"
  const [variant, setVariant] = useState<"inline" | "overlay">("inline")

  const inlineSnippet = `<script src="https://js.easner.com/checkout.js"></script>
<div id="easner-checkout"></div>
<script>
  // clientSecret comes from POST /v1/checkout/sessions (next step).
  EasnerCheckout.mount("#easner-checkout", {
    publishableKey: "${publishableKey}",
    clientSecret: window.EASNER_CLIENT_SECRET,
    onSuccess: function () {
      // Payment confirmed – shown in place. Route the customer on.
    },
  });
</script>`

  const overlaySnippet = `<script src="https://js.easner.com/checkout.js"></script>
<script>
  // One call from any button – opens checkout over your page.
  function payNow() {
    EasnerCheckout.open({
      publishableKey: "${publishableKey}",
      clientSecret: window.EASNER_CLIENT_SECRET,
      onSuccess: function () { window.location.href = "/thanks"; },
    });
  }
</script>
<button onclick="payNow()">Buy now</button>`

  return (
    <>
      <StepHeading title={STEP_COPY.snippet.title} blurb={STEP_COPY.snippet.blurb} />
      <div className="flex gap-2">
        {(
          [
            ["inline", "In your page"],
            ["overlay", "Overlay"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setVariant(id)}
            className={cn(
              "rounded-full border px-3.5 py-1.5 text-xs",
              variant === id ? "border-primary bg-primary/5 font-medium" : "text-muted-foreground",
            )}
          >
            {label}
          </button>
        ))}
      </div>
      <CheckoutCodeBlock
        label={variant === "inline" ? "On your checkout page" : "Anywhere on your site"}
        code={variant === "inline" ? inlineSnippet : overlaySnippet}
      />
      <StepLearnMore>
        <p>
          The client secret comes from the next step and is never hardcoded. Apple Pay and Google
          Pay appear automatically when the customer&apos;s device supports them, and the form uses
          the branding you set above. Logged-in apps can pass customerEmail and customerName so the
          form does not ask again. Omit onSuccess to send customers to your Success URL instead.
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
  -H "Idempotency-Key: order-1042" \\
  -d '{
    "mode": "payment",
    "currency": "USD",
    "line_items": [{ "name": "Pro plan", "amount": 4900 }],
    "customer_email": "buyer@example.com",
    "customer_name": "Buyer Name",
    "success_url": "${successUrl}",
    "cancel_url": "${cancelUrl}"
  }'`}
      />
      <StepLearnMore>
        <p>
          The response contains a client_secret – pass it to the snippet. Retrying with the same
          Idempotency-Key returns the first session instead of opening a duplicate. Optional
          customer_email and customer_name come back on the session so logged-in apps can hide
          the email field and prefill name on card. For a recurring charge use mode
          &quot;subscription&quot; with interval &quot;month&quot; or &quot;year&quot;. Full details
          are in Developers &rarr; API reference.
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
          <FieldEditControls
            editing={editing}
            saving={saving}
            hasSaved={Boolean(savedUrl)}
            saveDisabled={!url.trim()}
            onEdit={() => setEditing(true)}
            onCancel={() => {
              setUrl(savedUrl)
              setEditing(!savedUrl)
            }}
            onSave={() => void saveUrl()}
          />
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

      {savedUrl ? <WebhookDeliveriesPanel /> : null}

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

function WebhookDeliveriesPanel() {
  const [deliveries, setDeliveries] = useState<WebhookDelivery[] | null>(null)
  const [redelivering, setRedelivering] = useState<string | null>(null)

  const load = async () => {
    try {
      const res = await fetchWithSession("/api/checkout/webhook-deliveries")
      const body = (await res.json().catch(() => ({}))) as { deliveries?: WebhookDelivery[] }
      setDeliveries(Array.isArray(body.deliveries) ? body.deliveries : [])
    } catch {
      setDeliveries([])
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const redeliver = async (id: string) => {
    setRedelivering(id)
    try {
      const res = await fetchWithSession(`/api/checkout/webhook-deliveries/${id}/redeliver`, {
        method: "POST",
      })
      const body = (await res.json().catch(() => ({}))) as { error?: string; status?: number }
      if (!res.ok) {
        toast.error(body.error || "Delivery failed")
      } else {
        toast.success(`Delivered – your endpoint replied ${body.status ?? 200}.`)
      }
      await load()
    } finally {
      setRedelivering(null)
    }
  }

  const rows = deliveries ?? []
  if (deliveries !== null && rows.length === 0) return null

  return (
    <div className="flex flex-col gap-3 rounded-xl border p-4 sm:p-5">
      <div className="min-w-0 space-y-1">
        <p className="text-sm font-medium text-foreground">Recent deliveries</p>
        <p className="text-xs text-muted-foreground">
          Failed events retry automatically for up to a day. Resend one any time.
        </p>
      </div>
      <ul className="divide-y">
        {rows.slice(0, 8).map((delivery) => (
          <li key={delivery.id} className="flex items-center justify-between gap-3 py-2.5">
            <div className="min-w-0">
              <p className="truncate text-sm">
                <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{delivery.event}</code>
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {delivery.status === "delivered"
                  ? `Delivered${delivery.response_status ? ` · ${delivery.response_status}` : ""}`
                  : delivery.status === "pending"
                    ? `Retrying · attempt ${delivery.attempts}`
                    : `Failed${delivery.last_error ? ` · ${delivery.last_error}` : ""}`}
                {" · "}
                {new Date(delivery.created_at).toLocaleString()}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <span
                className={cn(
                  "inline-block h-2 w-2 rounded-full",
                  delivery.status === "delivered"
                    ? "bg-primary"
                    : delivery.status === "pending"
                      ? "bg-amber-500"
                      : "bg-destructive",
                )}
                aria-hidden
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={redelivering !== null}
                onClick={() => void redeliver(delivery.id)}
              >
                {redelivering === delivery.id ? "Sending…" : "Resend"}
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

function StepTest() {
  const [testPaymentsOpen, setTestPaymentsOpen] = useState(false)

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
        <button
          type="button"
          className="underline underline-offset-2"
          onClick={() => setTestPaymentsOpen(true)}
        >
          Transactions
        </button>
        . Use Test delivery in Webhook if you only need to confirm the endpoint.
      </p>
      <CheckoutTestPaymentsDialog open={testPaymentsOpen} onOpenChange={setTestPaymentsOpen} />
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


"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Check, Circle, Edit, Loader2, Plus, X } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { CheckoutDashboardPanel } from "@/components/checkout/checkout-dashboard-panel"
import { CheckoutGuideSheet } from "@/components/checkout/checkout-integration-guide"
import { analytics } from "@/lib/analytics"
import { CheckoutHubSkeleton } from "@/components/collections/collections-skeletons"
import {
  createCheckoutSite,
  saveCheckoutSettings,
  updateCheckoutSite,
  useCheckoutSettings,
  type CheckoutHubPayload,
  type CheckoutSite,
} from "@/hooks/use-checkout-settings"
import { COLLECTIONS_COPY } from "@/lib/copy/business-ui-copy"
import {
  CHECKOUT_SITE_SETUP_STEPS,
  checkoutSitePageReady,
  completedCheckoutSteps,
  firstIncompleteSiteSetupStep,
  type CheckoutSiteSetupStep,
} from "@/lib/checkout/checkout-phases"
import { cn } from "@/lib/utils"

const STEP_COPY: Record<CheckoutSiteSetupStep | "live", { title: string; blurb: string }> = {
  website: { title: COLLECTIONS_COPY.stepWebsiteTitle, blurb: COLLECTIONS_COPY.stepWebsiteBlurb },
  urls: { title: COLLECTIONS_COPY.stepUrlsTitle, blurb: COLLECTIONS_COPY.stepUrlsBlurb },
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
  const [pinnedStep, setPinnedStep] = useState<CheckoutSiteSetupStep | null>(null)
  const [focusStep, setFocusStep] = useState<CheckoutSiteSetupStep | null>(null)
  const [guideOpen, setGuideOpen] = useState(false)
  const [codeStep, setCodeStep] = useState<CheckoutSiteSetupStep | null>(null)

  const site = (data?.sites ?? []).find((item) => item.id === siteId) ?? null
  const completed = useMemo(() => completedCheckoutSteps(data, site), [data, site])
  const incomplete = firstIncompleteSiteSetupStep(data, site)
  const pageReady = flow === "edit" && checkoutSitePageReady(data, site)
  const currentStep = resolveSetupStep(pinnedStep, incomplete)

  useEffect(() => {
    if (pageReady) setPinnedStep(null)
  }, [pageReady])

  if (loading) {
    return <CheckoutHubSkeleton />
  }

  if (error || !data) {
    return (
      <Card>
        <CardContent className="flex flex-col gap-3 p-6 text-sm">
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
        <CardContent className="flex flex-col gap-3 p-6 text-sm">
          <p>{COLLECTIONS_COPY.siteNotFound}</p>
          <Button type="button" variant="outline" size="sm" asChild>
            <Link href="/checkout">{COLLECTIONS_COPY.siteNotFoundCta}</Link>
          </Button>
        </CardContent>
      </Card>
    )
  }

  const title =
    flow === "create"
      ? COLLECTIONS_COPY.setupCreateTitle
      : checkoutSiteHost(site?.origin) || COLLECTIONS_COPY.setupEditTitle
  const statusLabel = pageReady
    ? data.settings.liveModeEnabled
      ? COLLECTIONS_COPY.statusLive
      : COLLECTIONS_COPY.statusTest
    : COLLECTIONS_COPY.settingUp
  const editingReadyStep = pageReady ? focusStep : null
  const sheetFocus = guideOpen ? "guide" : codeStep

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h1 className="text-2xl font-semibold text-foreground">{title}</h1>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={() => setGuideOpen(true)}>
            {COLLECTIONS_COPY.addToWebsite}
          </Button>
          <Badge variant={pageReady ? (data.settings.liveModeEnabled ? "emerald" : "slate") : "amber"}>
            {statusLabel}
          </Badge>
        </div>
      </div>

      {pageReady && site && !editingReadyStep ? (
        <CheckoutDashboardPanel
          data={data}
          site={site}
          onEditStep={setFocusStep}
          liveSwitch={<StepLive data={data} onSaved={() => void refetch()} />}
        />
      ) : (
        <CheckoutSetupWizard
          data={data}
          site={site}
          completed={completed}
          currentStep={editingReadyStep ?? currentStep}
          showStepper={!editingReadyStep}
          onSelectStep={editingReadyStep ? setFocusStep : setPinnedStep}
          onNeedCode={setCodeStep}
          onSaved={() => void refetch()}
          onSiteCreated={(id) => router.replace(`/checkout/${id}`)}
          onDoneEditing={editingReadyStep ? () => setFocusStep(null) : undefined}
        />
      )}

      <CheckoutGuideSheet
        open={Boolean(sheetFocus)}
        onOpenChange={(open) => {
          if (!open) {
            setGuideOpen(false)
            setCodeStep(null)
          }
        }}
        data={data}
        site={site}
        focus={sheetFocus ?? "guide"}
      />
    </div>
  )
}

function resolveSetupStep(
  pinned: CheckoutSiteSetupStep | null,
  incomplete: CheckoutSiteSetupStep,
): CheckoutSiteSetupStep {
  if (!pinned) return incomplete
  const pinnedIndex = CHECKOUT_SITE_SETUP_STEPS.indexOf(pinned)
  const incompleteIndex = CHECKOUT_SITE_SETUP_STEPS.indexOf(incomplete)
  return pinnedIndex <= incompleteIndex ? pinned : incomplete
}

function checkoutSiteHost(origin: string | null | undefined): string {
  if (!origin) return ""
  try {
    return new URL(origin).host
  } catch {
    return origin.replace(/^https?:\/\//, "")
  }
}

function CheckoutSetupWizard({
  data,
  site,
  completed,
  currentStep,
  showStepper,
  onSelectStep,
  onNeedCode,
  onSaved,
  onSiteCreated,
  onDoneEditing,
}: {
  data: CheckoutHubPayload
  site: CheckoutSite | null
  completed: ReturnType<typeof completedCheckoutSteps>
  currentStep: CheckoutSiteSetupStep
  showStepper: boolean
  onSelectStep: (step: CheckoutSiteSetupStep) => void
  onNeedCode: (step: CheckoutSiteSetupStep) => void
  onSaved: () => void
  onSiteCreated: (id: string) => void
  onDoneEditing?: () => void
}) {
  const stepIndex = CHECKOUT_SITE_SETUP_STEPS.indexOf(currentStep)
  const nextStep = CHECKOUT_SITE_SETUP_STEPS[stepIndex + 1]
  const currentDone = completed.has(currentStep)

  return (
    <div className="flex flex-col gap-6">
      {showStepper ? (
        <div className="flex flex-col gap-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {COLLECTIONS_COPY.setupProgress} · {stepIndex + 1} {COLLECTIONS_COPY.of}{" "}
            {CHECKOUT_SITE_SETUP_STEPS.length} · {STEP_COPY[currentStep].title}
          </p>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {CHECKOUT_SITE_SETUP_STEPS.map((step, index) => {
              const isDone = completed.has(step)
              const isCurrent = step === currentStep
              return (
                <button
                  key={step}
                  type="button"
                  onClick={() => onSelectStep(step)}
                  className={cn(
                    "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs",
                    isCurrent ? "border-primary bg-primary/5 font-medium" : "text-muted-foreground",
                  )}
                >
                  {isDone ? (
                    <Check className="size-3.5 text-primary" aria-hidden />
                  ) : (
                    <Circle className="size-3.5" aria-hidden />
                  )}
                  {index + 1}. {STEP_COPY[step].title}
                </button>
              )
            })}
          </div>
        </div>
      ) : null}

      <Card>
        <CardContent className="flex flex-col gap-6 p-6 sm:p-8">
          <StepBody
            step={currentStep}
            data={data}
            site={site}
            onSaved={onSaved}
            onSiteCreated={onSiteCreated}
          />
          <div className="flex flex-wrap gap-2">
            {onDoneEditing ? (
              <Button type="button" onClick={onDoneEditing}>
                {COLLECTIONS_COPY.doneEditing}
              </Button>
            ) : nextStep ? (
              <Button type="button" disabled={!currentDone} onClick={() => onSelectStep(nextStep)}>
                {COLLECTIONS_COPY.next} · {STEP_COPY[nextStep].title}
              </Button>
            ) : null}
            <Button type="button" variant="ghost" onClick={() => onNeedCode(currentStep)}>
              {COLLECTIONS_COPY.needTheCode}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

type HubDataProps = { data: CheckoutHubPayload; onSaved: () => void }
type SiteStepProps = HubDataProps & {
  site: CheckoutSite | null
  onSiteCreated: (id: string) => void
}

function StepBody({
  step,
  data,
  site,
  onSaved,
  onSiteCreated,
}: SiteStepProps & { step: CheckoutSiteSetupStep }) {
  switch (step) {
    case "website":
      return <StepWebsite data={data} site={site} onSaved={onSaved} onSiteCreated={onSiteCreated} />
    case "urls":
      return <StepUrls data={data} site={site} onSaved={onSaved} onSiteCreated={onSiteCreated} />
  }
}

function StepHeading({ title, blurb }: { title: string; blurb: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <h2 className="text-lg font-semibold leading-snug text-foreground">{title}</h2>
      <p className="text-sm leading-relaxed text-muted-foreground">{blurb}</p>
    </div>
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
        {saving ? <Loader2 className="animate-spin" data-icon="inline-start" aria-hidden /> : <Plus data-icon="inline-start" aria-hidden />}
        Add
      </Button>
    )
  }
  if (editing) {
    return (
      <div className="flex items-center gap-2">
        <Button type="button" variant="outline" size="sm" disabled={saving} onClick={onCancel}>
          <X data-icon="inline-start" aria-hidden />
          Cancel
        </Button>
        <Button type="button" size="sm" disabled={saving || saveDisabled} onClick={onSave}>
          {saving ? <Loader2 className="animate-spin" data-icon="inline-start" aria-hidden /> : <Check data-icon="inline-start" aria-hidden />}
          Save
        </Button>
      </div>
    )
  }
  return (
    <Button type="button" variant="outline" size="sm" onClick={onEdit}>
      <Edit data-icon="inline-start" aria-hidden />
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
      <div className="flex flex-col gap-3">
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
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-3">
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
            placeholder="https://shop.yoursite.com/thanks"
            disabled={!site || !editingSuccess}
          />
          <p className="text-xs text-muted-foreground">
            A thanks page is enough. Add {"?session_id={CHECKOUT_SESSION_ID}"} only if that page
            needs to look up the order.
          </p>
        </div>
        <div className="flex flex-col gap-3">
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


function StepLive({ data, onSaved }: HubDataProps) {
  const [saving, setSaving] = useState(false)
  const gateReady =
    data.readiness.ready &&
    Boolean(data.settings.testPaymentCompletedAt) &&
    Boolean(data.settings.lastWebhookDeliveredAt)

  const toggle = async (next: boolean) => {
    setSaving(true)
    try {
      const result = await saveCheckoutSettings({ live_mode_enabled: next })
      if (!result.ok) {
        toast.error(result.error || "Could not save")
        return
      }
      toast.success(next ? "Live payments on." : "Live payments off.")
      if (next) analytics.trackCheckoutSiteLiveEnabled()
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
            {gateReady
              ? "Connect is ready, a test payment on your website succeeded, and a webhook returned 200."
              : data.readiness.ready
                ? "Pay on your website with test keys, and confirm a webhook returns 200, before going live."
                : "Complete verification first."}
          </p>
        </div>
        <Switch
          checked={data.settings.liveModeEnabled}
          disabled={saving || (!data.settings.liveModeEnabled && !gateReady)}
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

import type { SupabaseClient } from "@supabase/supabase-js"
import { emailService } from "@easner/server"
import type { OnlinePaymentsEmailData } from "@easner/server"
import { getEmailAudienceProfile } from "@easner/server"
import { resolveOrgOwnerUserId } from "@/lib/business/org-owner"
import { fetchUserEmailContact } from "@/lib/notifications/user-contact"
import {
  resolveConnectPanelPhase,
  type ConnectPanelPhase,
  type ConnectStatusSnapshot,
} from "@/lib/stripe/connect-panel-ux"
import type { ConnectEmailNotifications, ConnectReadyStatus } from "@/lib/stripe/connect/types"
import { getConnectAccountRow } from "@/lib/stripe/connect/resolve-connect-account"

export type OnlinePaymentsEmailKind = OnlinePaymentsEmailData["status"]

function businessAppBase(): string {
  return (
    process.env.NEXT_PUBLIC_BUSINESS_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "https://business.easner.com"
  ).replace(/\/$/, "")
}

export function connectReadyToStatusSnapshot(
  ready: ConnectReadyStatus,
): ConnectStatusSnapshot {
  return {
    enabled: true,
    connectEnabled: true,
    ready: ready.ready,
    tier1Complete: ready.tier1Complete,
    reason: ready.reason ?? null,
    stripeAccountId: ready.stripeAccountId,
    onboardingStatus: ready.onboardingStatus,
    transfersEnabled: ready.transfersEnabled,
    payoutsEnabled: ready.payoutsEnabled,
    detailsSubmitted: ready.detailsSubmitted,
    externalAccountLinked: ready.externalAccountLinked,
    hasGridVa: ready.hasGridVa,
    requirementsCurrentlyDue: ready.requirementsCurrentlyDue,
  }
}

export function requirementsFingerprint(due: string[] | undefined): string {
  return [...(due ?? [])].map((s) => s.trim()).filter(Boolean).sort().join("|")
}

export function parseConnectEmailNotifications(raw: unknown): ConnectEmailNotifications {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {}
  const o = raw as Record<string, unknown>
  return {
    setupStartedAt: typeof o.setupStartedAt === "string" ? o.setupStartedAt : undefined,
    actionRequiredAt: typeof o.actionRequiredAt === "string" ? o.actionRequiredAt : undefined,
    actionRequiredFingerprint:
      typeof o.actionRequiredFingerprint === "string" ? o.actionRequiredFingerprint : undefined,
    readyAt: typeof o.readyAt === "string" ? o.readyAt : undefined,
  }
}

/**
 * Decide which lifecycle email to send (if any) given previous/next Connect snapshots
 * and persisted dedupe state. At most one email per sync call (priority: setup → action → ready).
 */
export function resolveOnlinePaymentsEmailKind(input: {
  previous: ConnectStatusSnapshot | null
  next: ConnectStatusSnapshot
  notifications: ConnectEmailNotifications
}): { kind: OnlinePaymentsEmailKind; fingerprint?: string } | null {
  const prevPhase: ConnectPanelPhase | null = input.previous
    ? resolveConnectPanelPhase(input.previous)
    : null
  const nextPhase = resolveConnectPanelPhase(input.next)
  const notif = input.notifications
  const nextFp = requirementsFingerprint(input.next.requirementsCurrentlyDue)
  const hadAccount = Boolean(input.previous?.stripeAccountId)
  const hasAccount = Boolean(input.next.stripeAccountId)

  // Setup started – first time we have a connected account id
  if (
    hasAccount &&
    !notif.setupStartedAt &&
    (!hadAccount || input.previous == null) &&
    nextPhase !== "not_started"
  ) {
    return { kind: "setup_started" }
  }

  // Action required – enter requirements_due, or due set changes while still due
  if (nextPhase === "requirements_due") {
    const entered =
      prevPhase !== "requirements_due" ||
      (input.previous != null &&
        requirementsFingerprint(input.previous.requirementsCurrentlyDue) !== nextFp)
    if (entered && notif.actionRequiredFingerprint !== nextFp) {
      return { kind: "action_required", fingerprint: nextFp }
    }
  }

  // Ready – once
  if (nextPhase === "ready" && !notif.readyAt) {
    return { kind: "ready" }
  }

  return null
}

function templateForKind(kind: OnlinePaymentsEmailKind): string {
  switch (kind) {
    case "setup_started":
      return "onlinePaymentsSetupStarted"
    case "action_required":
      return "onlinePaymentsActionRequired"
    case "ready":
      return "onlinePaymentsReady"
    default:
      return "onlinePaymentsSetupStarted"
  }
}

async function fetchCommunicationPreferences(admin: SupabaseClient, userId: string) {
  const { data } = await admin
    .from("user_preferences")
    .select("communication_preferences")
    .eq("user_id", userId)
    .maybeSingle()
  return (data as { communication_preferences?: unknown } | null)?.communication_preferences
}

async function persistEmailNotifications(
  admin: SupabaseClient,
  businessId: string,
  next: ConnectEmailNotifications,
): Promise<void> {
  await admin
    .from("business_stripe_connect_accounts")
    .update({
      email_notifications: next,
      updated_at: new Date().toISOString(),
    })
    .eq("business_id", businessId)
}

export async function notifyOnlinePaymentsStatusChange(input: {
  admin: SupabaseClient
  businessId: string
  previous: ConnectStatusSnapshot | null
  next: ConnectStatusSnapshot
}): Promise<OnlinePaymentsEmailKind | null> {
  const row = await getConnectAccountRow(input.admin, input.businessId)
  const notifications = parseConnectEmailNotifications(row?.email_notifications)
  const resolved = resolveOnlinePaymentsEmailKind({
    previous: input.previous,
    next: input.next,
    notifications,
  })
  if (!resolved) return null

  const ownerUserId = await resolveOrgOwnerUserId(input.admin, input.businessId, "")
  if (!ownerUserId) return null

  const contact = await fetchUserEmailContact(input.admin, ownerUserId)
  if (!contact.email) return null

  const profile = getEmailAudienceProfile("business")
  const base = businessAppBase()
  const verificationUrl = `${base}/settings?tab=verification`
  const data: OnlinePaymentsEmailData = {
    email: contact.email,
    firstName: contact.firstName,
    status: resolved.kind,
    summary:
      resolved.kind === "action_required"
        ? input.next.reason?.trim() || "Open Verification to finish the remaining steps."
        : undefined,
    dashboardUrl: base,
    verificationUrl,
    audience: "business",
  }

  const prefs = await fetchCommunicationPreferences(input.admin, ownerUserId)
  await emailService
    .sendEmail(
      {
        to: contact.email,
        template: templateForKind(resolved.kind),
        data,
        audience: "business",
      },
      prefs,
    )
    .catch((e) => console.warn("online payments email (non-fatal):", e))

  const now = new Date().toISOString()
  const updated: ConnectEmailNotifications = { ...notifications }
  if (resolved.kind === "setup_started") updated.setupStartedAt = now
  if (resolved.kind === "action_required") {
    updated.actionRequiredAt = now
    updated.actionRequiredFingerprint = resolved.fingerprint ?? requirementsFingerprint(input.next.requirementsCurrentlyDue)
  }
  if (resolved.kind === "ready") updated.readyAt = now

  await persistEmailNotifications(input.admin, input.businessId, updated).catch((e) =>
    console.warn("online payments email dedupe persist (non-fatal):", e),
  )

  void profile.dashboardUrl

  return resolved.kind
}

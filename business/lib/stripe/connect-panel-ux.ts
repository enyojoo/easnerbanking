import type { CachedConnectStatus } from "@/lib/stripe/connect-status-cache"

export type ConnectStatusSnapshot = Omit<CachedConnectStatus, "cachedAt">

export type ConnectPanelPhase =
  | "not_started"
  | "in_progress"
  | "requirements_due"
  | "pending_review"
  | "link_payout"
  | "missing_virtual_account"
  | "activating"
  | "ready"

export type ConnectPanelActionKind = "open_onboarding" | "link_payout"

export type ConnectPanelAction = {
  kind: ConnectPanelActionKind
  label: string
  variant: "default" | "secondary" | "outline"
  dialogTitle: string
  dialogDescription?: string
}

export type ConnectPanelUx = {
  phase: ConnectPanelPhase
  badgeLabel: string
  badgeKind: "ready" | "almost_ready" | "pending" | "in_progress" | "not_started" | "blocked"
  summary?: string
  checklist: Array<{ label: string; done: boolean }>
  primary?: ConnectPanelAction
  secondary?: ConnectPanelAction
}

function requirementsDue(status: ConnectStatusSnapshot): string[] {
  return status.requirementsCurrentlyDue ?? []
}

export function resolveConnectPanelPhase(status: ConnectStatusSnapshot): ConnectPanelPhase {
  if (status.ready) return "ready"

  const due = requirementsDue(status)
  if (due.length > 0) return "requirements_due"

  if (!status.stripeAccountId) return "not_started"

  if (!status.detailsSubmitted) return "in_progress"

  if (!status.hasGridVa) return "missing_virtual_account"

  if (!status.externalAccountLinked) return "link_payout"

  if (!status.transfersEnabled || !status.payoutsEnabled) return "activating"

  return "pending_review"
}

function onboardingAction(
  label: string,
  dialogTitle: string,
  variant: ConnectPanelAction["variant"] = "default",
  dialogDescription?: string,
): ConnectPanelAction {
  return {
    kind: "open_onboarding",
    label,
    variant,
    dialogTitle,
    dialogDescription,
  }
}

export function resolveConnectPanelUx(status: ConnectStatusSnapshot): ConnectPanelUx {
  const phase = resolveConnectPanelPhase(status)

  const checklist = [
    { label: "Business verified", done: Boolean(status.detailsSubmitted) },
    { label: "Transfers enabled", done: Boolean(status.transfersEnabled) },
    { label: "Payouts enabled", done: Boolean(status.payoutsEnabled) },
    { label: "Easner USD account ready", done: Boolean(status.hasGridVa) },
    { label: "Payouts linked to Easner", done: Boolean(status.externalAccountLinked) },
  ]

  switch (phase) {
    case "not_started":
      return {
        phase,
        badgeLabel: "Not started",
        badgeKind: "not_started",
        summary: "Verify your business to accept card payments on invoices.",
        checklist,
        primary: onboardingAction("Get started", "Set up online payments"),
      }

    case "in_progress":
      return {
        phase,
        badgeLabel: "In progress",
        badgeKind: "in_progress",
        checklist,
        primary: onboardingAction("Continue", "Continue verification"),
      }

    case "requirements_due":
      return {
        phase,
        badgeLabel: "Action required",
        badgeKind: "blocked",
        summary: status.reason ?? "Additional information is required.",
        checklist,
        primary: onboardingAction("Complete", "Complete requirements"),
      }

    case "pending_review":
      return {
        phase,
        badgeLabel: "Verification pending",
        badgeKind: "pending",
        summary: "We're reviewing your details. This updates automatically.",
        checklist,
      }

    case "missing_virtual_account":
      return {
        phase,
        badgeLabel: "Setup incomplete",
        badgeKind: "blocked",
        summary: "Your Easner USD account is needed before payouts can be linked.",
        checklist,
      }

    case "link_payout":
      return {
        phase,
        badgeLabel: "Almost ready",
        badgeKind: "almost_ready",
        summary: "Link payouts to your Easner USD account to finish setup.",
        checklist,
        primary: {
          kind: "link_payout",
          label: "Link payouts",
          variant: "default",
          dialogTitle: "Link payouts to Easner",
        },
      }

    case "activating":
      return {
        phase,
        badgeLabel: "Activating",
        badgeKind: "pending",
        summary: "We're enabling transfers and payouts. This updates automatically.",
        checklist,
      }

    case "ready":
    default:
      return {
        phase: "ready",
        badgeLabel: "Ready",
        badgeKind: "ready",
        checklist,
      }
  }
}

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
    { label: "Transfers", done: Boolean(status.transfersEnabled) },
    { label: "Payouts", done: Boolean(status.payoutsEnabled) },
    { label: "Virtual account", done: Boolean(status.hasGridVa) },
    { label: "Payout linked", done: Boolean(status.externalAccountLinked) },
  ]

  switch (phase) {
    case "not_started":
      return {
        phase,
        badgeLabel: "Not started",
        badgeKind: "not_started",
        summary: "Verify with Stripe to accept card payments on invoices.",
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
        summary: status.reason ?? "Stripe needs updated information.",
        checklist,
        primary: onboardingAction("Complete requirements", "Complete requirements"),
        secondary: onboardingAction(
          "Review profile",
          "Review business profile",
          "outline",
        ),
      }

    case "pending_review":
      return {
        phase,
        badgeLabel: "Verification pending",
        badgeKind: "pending",
        summary: "Stripe is reviewing your details. This updates automatically.",
        checklist,
        secondary: onboardingAction(
          "Review details",
          "Review submitted details",
          "outline",
        ),
      }

    case "missing_virtual_account":
      return {
        phase,
        badgeLabel: "Setup incomplete",
        badgeKind: "blocked",
        summary: "Provision a virtual account to link payouts.",
        checklist,
        secondary: status.stripeAccountId
          ? onboardingAction("Review profile", "Review business profile", "outline")
          : undefined,
      }

    case "link_payout":
      return {
        phase,
        badgeLabel: "Almost ready",
        badgeKind: "almost_ready",
        summary: "Link your virtual account to finish payout setup.",
        checklist,
        primary: {
          kind: "link_payout",
          label: "Link payout",
          variant: "default",
          dialogTitle: "Link payout",
        },
        secondary: onboardingAction("Edit profile", "Edit business profile", "outline"),
      }

    case "activating":
      return {
        phase,
        badgeLabel: "Activating",
        badgeKind: "pending",
        summary: "Stripe is enabling transfers and payouts.",
        checklist,
        secondary: onboardingAction("Review profile", "Review business profile", "outline"),
      }

    case "ready":
    default:
      return {
        phase: "ready",
        badgeLabel: "Ready",
        badgeKind: "ready",
        checklist,
        secondary: onboardingAction("Edit profile", "Edit business profile", "outline"),
      }
  }
}

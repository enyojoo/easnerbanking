import type { CachedConnectStatus } from "@/lib/stripe/connect-status-cache"
import { VERIFICATION_SECTION_COPY } from "@/lib/copy/business-ui-copy"
import { NOAH_VERIFICATION_IN_REVIEW_COPY, VERIFICATION_STATUS_COPY } from "@easner/shared"

export type ConnectStatusSnapshot = Omit<CachedConnectStatus, "cachedAt">

export type ConnectPanelPhase =
  | "kyb_required"
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
  /** Maps to Tier 1 badge via `connectPanelVerificationPresentation`. */
  verificationStatus: string
  verificationComplete: boolean
  bodyCopy?: string
  bodyCopyDestructive?: string
  primary?: ConnectPanelAction
  secondary?: ConnectPanelAction
}

const BEGIN_VERIFICATION = "Begin verification"
const CONTINUE_VERIFICATION = "Continue verification"
const ONLINE_PAYMENT_VERIFICATION = "Online payment verification"

function requirementsDue(status: ConnectStatusSnapshot): string[] {
  return status.requirementsCurrentlyDue ?? []
}

export function resolveConnectPanelPhase(status: ConnectStatusSnapshot): ConnectPanelPhase {
  if (status.tier1Complete === false) return "kyb_required"
  if (status.ready) return "ready"

  const due = requirementsDue(status)
  if (due.length > 0) return "requirements_due"

  if (!status.stripeAccountId) return "not_started"

  if (!status.hasGridVa) return "missing_virtual_account"

  if (!status.detailsSubmitted) return "in_progress"

  if (!status.externalAccountLinked) return "link_payout"

  if (!status.transfersEnabled || !status.payoutsEnabled) return "activating"

  return "pending_review"
}

/** Align Online payments badge styling with Tier 1 KYB. */
export function connectPanelVerificationPresentation(
  phase: ConnectPanelPhase,
  ready: boolean,
): { status: string; complete: boolean } {
  if (ready || phase === "ready") {
    return { status: "approved", complete: true }
  }
  switch (phase) {
    case "kyb_required":
    case "not_started":
      return { status: "not_started", complete: false }
    case "in_progress":
    case "link_payout":
    case "missing_virtual_account":
      return { status: "in_progress", complete: false }
    case "requirements_due":
      return { status: "hold", complete: false }
    case "pending_review":
    case "activating":
      return { status: "pending", complete: false }
    default:
      return { status: "not_started", complete: false }
  }
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
  const presentation = connectPanelVerificationPresentation(phase, Boolean(status.ready))

  switch (phase) {
    case "kyb_required":
      return {
        phase,
        verificationStatus: presentation.status,
        verificationComplete: presentation.complete,
        bodyCopy: VERIFICATION_SECTION_COPY.onlinePaymentsTier1Required,
      }

    case "not_started":
      return {
        phase,
        verificationStatus: presentation.status,
        verificationComplete: presentation.complete,
        primary: onboardingAction(BEGIN_VERIFICATION, ONLINE_PAYMENT_VERIFICATION),
      }

    case "in_progress":
      return {
        phase,
        verificationStatus: presentation.status,
        verificationComplete: presentation.complete,
        primary: onboardingAction(CONTINUE_VERIFICATION, CONTINUE_VERIFICATION),
      }

    case "requirements_due":
      return {
        phase,
        verificationStatus: presentation.status,
        verificationComplete: presentation.complete,
        bodyCopy:
          status.reason?.trim() || VERIFICATION_SECTION_COPY.verificationOnHold,
        primary: onboardingAction(CONTINUE_VERIFICATION, CONTINUE_VERIFICATION),
      }

    case "pending_review":
    case "activating":
      return {
        phase,
        verificationStatus: presentation.status,
        verificationComplete: presentation.complete,
        bodyCopy: NOAH_VERIFICATION_IN_REVIEW_COPY,
      }

    case "missing_virtual_account":
      return {
        phase,
        verificationStatus: presentation.status,
        verificationComplete: presentation.complete,
        bodyCopy:
          status.reason?.trim() ||
          "Your Easner USD account is still provisioning. Online payment verification will be available shortly.",
      }

    case "link_payout":
      return {
        phase,
        verificationStatus: presentation.status,
        verificationComplete: presentation.complete,
        bodyCopy: "Link payouts to your Easner USD account to finish verification.",
        primary: {
          kind: "link_payout",
          label: CONTINUE_VERIFICATION,
          variant: "default",
          dialogTitle: CONTINUE_VERIFICATION,
        },
      }

    case "ready":
    default:
      return {
        phase: "ready",
        verificationStatus: presentation.status,
        verificationComplete: presentation.complete,
      }
  }
}

/** @deprecated Use connectPanelVerificationPresentation + verificationStatusLabel */
export function connectPanelBadgeLabel(phase: ConnectPanelPhase, ready: boolean): string {
  const { status, complete } = connectPanelVerificationPresentation(phase, ready)
  if (complete) return VERIFICATION_STATUS_COPY.verified
  if (status === "in_progress") return VERIFICATION_STATUS_COPY.inProgress
  if (status === "pending") return VERIFICATION_STATUS_COPY.inReview
  if (status === "hold") return VERIFICATION_STATUS_COPY.actionNeeded
  return VERIFICATION_STATUS_COPY.notStarted
}

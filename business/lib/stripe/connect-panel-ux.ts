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

export type ConnectChecklistItem = {
  label: string
  done: boolean
}

export type ConnectPanelUx = {
  phase: ConnectPanelPhase
  /** Maps to Tier 1 badge via `connectPanelVerificationPresentation`. */
  verificationStatus: string
  verificationComplete: boolean
  bodyCopy?: string
  bodyCopyDestructive?: string
  checklist: ConnectChecklistItem[]
  primary?: ConnectPanelAction
  secondary?: ConnectPanelAction
}

const BEGIN_VERIFICATION = "Begin verification"
const CONTINUE_VERIFICATION = "Continue verification"
const LINK_ACCOUNT = "Link Account"
const ONLINE_PAYMENT_VERIFICATION = "Online payment verification"

function isPlatformCollectedRequirement(key: string): boolean {
  return key.startsWith("tos_acceptance")
}

function isExternalAccountRequirement(key: string): boolean {
  return key === "external_account" || key.startsWith("external_account.")
}

export function requirementsDue(status: ConnectStatusSnapshot): string[] {
  return (status.requirementsCurrentlyDue ?? []).filter((key) => !isPlatformCollectedRequirement(key))
}

export function requirementsDueExcludingPayoutAccount(status: ConnectStatusSnapshot): string[] {
  return requirementsDue(status).filter((key) => !isExternalAccountRequirement(key))
}

const CONNECT_REQUIREMENT_LABELS: Record<string, string> = {
  "business_profile.url": "Business website",
  "business_profile.product_description": "Product description",
  "business_profile.mcc": "Business category",
  "company.tax_id": "Tax ID",
  "company.address.line1": "Company address",
  "company.verification.document": "Company documents",
  "individual.verification.document": "Identity document",
  external_account: "Payout account",
}

export function labelConnectRequirement(key: string): string {
  if (CONNECT_REQUIREMENT_LABELS[key]) return CONNECT_REQUIREMENT_LABELS[key]
  const last = key.split(".").pop() ?? key
  return last.replace(/_/g, " ")
}

export function connectSetupChecklist(status: ConnectStatusSnapshot): ConnectChecklistItem[] {
  const due = requirementsDue(status)
  const businessVerified = Boolean(status.detailsSubmitted) && due.length === 0
  const items: ConnectChecklistItem[] = [
    { label: "Business verified", done: businessVerified },
    { label: "Transfers", done: Boolean(status.transfersEnabled) },
    { label: "Payouts", done: Boolean(status.payoutsEnabled) },
    { label: "Virtual account", done: Boolean(status.hasGridVa) },
    { label: "Payout linked", done: Boolean(status.externalAccountLinked) },
  ]
  if (due.length > 0) {
    const dueItems = due.slice(0, 6).map((key) => ({
      label: labelConnectRequirement(key),
      done: false,
    }))
    return [...dueItems, ...items]
  }
  return items
}

export function resolveConnectPanelPhase(status: ConnectStatusSnapshot): ConnectPanelPhase {
  if (status.tier1Complete === false) return "kyb_required"
  if (status.ready) return "ready"

  const otherDue = requirementsDueExcludingPayoutAccount(status)
  if (otherDue.length > 0) return "requirements_due"

  if (!status.stripeAccountId) return "not_started"

  if (!status.hasGridVa) return "missing_virtual_account"

  if (!status.externalAccountLinked) return "link_payout"

  if (!status.detailsSubmitted) return "in_progress"

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
    case "missing_virtual_account":
      return { status: "in_progress", complete: false }
    case "link_payout":
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
  const checklist = connectSetupChecklist(status)

  switch (phase) {
    case "kyb_required":
      return {
        phase,
        verificationStatus: presentation.status,
        verificationComplete: presentation.complete,
        bodyCopy: VERIFICATION_SECTION_COPY.onlinePaymentsTier1Required,
        checklist,
      }

    case "not_started":
      return {
        phase,
        verificationStatus: presentation.status,
        verificationComplete: presentation.complete,
        checklist,
        primary: onboardingAction(BEGIN_VERIFICATION, ONLINE_PAYMENT_VERIFICATION),
      }

    case "in_progress":
      return {
        phase,
        verificationStatus: presentation.status,
        verificationComplete: presentation.complete,
        checklist,
        primary: onboardingAction(CONTINUE_VERIFICATION, CONTINUE_VERIFICATION),
      }

    case "requirements_due":
      return {
        phase,
        verificationStatus: presentation.status,
        verificationComplete: presentation.complete,
        bodyCopy:
          status.reason?.trim() || VERIFICATION_SECTION_COPY.verificationOnHold,
        checklist,
        primary: onboardingAction(CONTINUE_VERIFICATION, CONTINUE_VERIFICATION),
      }

    case "pending_review":
    case "activating":
      return {
        phase,
        verificationStatus: presentation.status,
        verificationComplete: presentation.complete,
        bodyCopy: NOAH_VERIFICATION_IN_REVIEW_COPY,
        checklist,
      }

    case "missing_virtual_account":
      return {
        phase,
        verificationStatus: presentation.status,
        verificationComplete: presentation.complete,
        bodyCopy:
          status.reason?.trim() ||
          "Your Easner USD account is still provisioning. Online payment verification will be available shortly.",
        checklist,
      }

    case "link_payout":
      return {
        phase,
        verificationStatus: presentation.status,
        verificationComplete: presentation.complete,
        bodyCopy: "Link your Easner USD account as the payout destination.",
        checklist,
        primary: {
          kind: "link_payout",
          label: LINK_ACCOUNT,
          variant: "default",
          dialogTitle: LINK_ACCOUNT,
        },
      }

    case "ready":
    default:
      return {
        phase: "ready",
        verificationStatus: presentation.status,
        verificationComplete: presentation.complete,
        checklist,
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

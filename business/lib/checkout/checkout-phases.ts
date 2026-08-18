import type { CheckoutHubPayload } from "@/lib/checkout/hub-types"

export type CheckoutPhaseId = "get_ready" | "connect_site" | "integrate" | "verify"

export type CheckoutStepId =
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

export const CHECKOUT_PHASES: Array<{
  id: CheckoutPhaseId
  steps: CheckoutStepId[]
}> = [
  { id: "get_ready", steps: ["ready", "fees"] },
  { id: "connect_site", steps: ["website", "urls"] },
  { id: "integrate", steps: ["keys", "snippet", "session"] },
  { id: "verify", steps: ["webhook", "test", "live"] },
]

export function completedCheckoutSteps(data: CheckoutHubPayload | null): Set<CheckoutStepId> {
  const done = new Set<CheckoutStepId>()
  if (!data) return done
  if (data.readiness.ready) done.add("ready")
  if (data.settings.businessFeeMode || data.settings.feeModeManagedByEasner) done.add("fees")
  if (data.settings.allowedOrigins.length > 0) done.add("website")
  if (data.settings.defaultSuccessUrl) done.add("urls")
  if (data.keys.length > 0) {
    done.add("keys")
    if (data.settings.testPaymentCompletedAt) {
      done.add("snippet")
      done.add("session")
    }
  }
  if (data.settings.webhookUrl && data.settings.webhookSecretLast4) done.add("webhook")
  if (data.settings.testPaymentCompletedAt) done.add("test")
  if (data.settings.liveModeEnabled) done.add("live")
  return done
}

export function phaseComplete(
  phase: (typeof CHECKOUT_PHASES)[number],
  done: Set<CheckoutStepId>,
): boolean {
  if (phase.id === "integrate") {
    return done.has("keys") && done.has("test")
  }
  if (phase.id === "verify") {
    return done.has("webhook") && (done.has("live") || done.has("test"))
  }
  return phase.steps.every((step) => done.has(step))
}

export function firstIncompletePhase(data: CheckoutHubPayload | null): CheckoutPhaseId {
  const done = completedCheckoutSteps(data)
  const incomplete = CHECKOUT_PHASES.find((phase) => !phaseComplete(phase, done))
  return incomplete?.id ?? "verify"
}

export function checkoutSetupComplete(data: CheckoutHubPayload | null): boolean {
  if (!data) return false
  if (data.settings.liveModeEnabled) return true
  const done = completedCheckoutSteps(data)
  const integrate = CHECKOUT_PHASES.find((phase) => phase.id === "integrate")
  const verify = CHECKOUT_PHASES.find((phase) => phase.id === "verify")
  return Boolean(integrate && verify && phaseComplete(integrate, done) && phaseComplete(verify, done))
}

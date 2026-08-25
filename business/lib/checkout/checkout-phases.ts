import type { CheckoutHubPayload, CheckoutSite } from "@/lib/checkout/hub-types"

export type CheckoutPhaseId = "connect_site" | "integrate" | "verify"

export type CheckoutStepId =
  | "website"
  | "urls"
  | "keys"
  | "branding"
  | "snippet"
  | "session"
  | "webhook"
  | "test"
  | "live"

export const CHECKOUT_PHASES: Array<{
  id: CheckoutPhaseId
  steps: CheckoutStepId[]
}> = [
  { id: "connect_site", steps: ["website", "urls"] },
  { id: "integrate", steps: ["keys", "branding", "snippet", "session"] },
  { id: "verify", steps: ["webhook", "test", "live"] },
]

/**
 * Steps complete on evidence, not intent: `session` when a session was actually
 * created through the merchant API, `snippet`/`test` when a test payment ran end
 * to end, `webhook` when a signed event was actually accepted by the endpoint.
 */
export function completedCheckoutSteps(
  data: CheckoutHubPayload | null,
  site?: CheckoutSite | null,
): Set<CheckoutStepId> {
  const done = new Set<CheckoutStepId>()
  if (!data) return done
  const websiteDone =
    site !== undefined
      ? Boolean(site?.origin)
      : (data.sites ?? []).some((item) => item.origin) || data.settings.allowedOrigins.length > 0
  const urlsDone =
    site !== undefined
      ? Boolean(site?.successUrl)
      : (data.sites ?? []).some((item) => item.successUrl) || Boolean(data.settings.defaultSuccessUrl)
  if (websiteDone) done.add("website")
  if (urlsDone) done.add("urls")
  if (data.keys.length > 0) done.add("keys")
  // Branding is optional – it never blocks setup.
  done.add("branding")

  // Older cached payloads have no integration evidence – fall back to the legacy
  // "keys exist" heuristic rather than un-completing a merchant's setup.
  const integration = data.integration
  const sessionEvidence = integration ? Boolean(integration.sessionCreatedAt) : data.keys.length > 0
  const paymentEvidence =
    Boolean(data.settings.testPaymentCompletedAt) || data.settings.liveModeEnabled
  if (sessionEvidence) done.add("session")
  if (sessionEvidence || paymentEvidence) {
    if (integration ? Boolean(integration.sessionCreatedAt) || paymentEvidence : true) {
      done.add("snippet")
    }
  }
  if (paymentEvidence) done.add("test")

  const webhookConfigured = Boolean(data.settings.webhookUrl && data.settings.webhookSecretLast4)
  const webhookEvidence = integration ? Boolean(integration.webhookDeliveredAt) : true
  if (webhookConfigured && webhookEvidence) done.add("webhook")
  if (data.settings.liveModeEnabled) done.add("live")
  return done
}

export function phaseComplete(
  phase: (typeof CHECKOUT_PHASES)[number],
  done: Set<CheckoutStepId>,
): boolean {
  if (phase.id === "integrate") {
    return done.has("keys") && done.has("session")
  }
  if (phase.id === "verify") {
    return done.has("webhook")
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

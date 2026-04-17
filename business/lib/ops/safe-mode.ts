/**
 * Safe mode: pause **new** payment intents while keeping webhooks + reconciliation running (plan §10).
 */
export function isNewPaymentIntentsPaused(): boolean {
  return process.env.EASNER_SAFE_MODE_PAUSE_NEW_INTENTS === "true"
}

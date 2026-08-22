export function isStripeHostElement(value: unknown): value is HTMLElement {
  if (!value || typeof value !== 'object') return false
  const node = value as { nodeType?: number; appendChild?: unknown }
  if (node.nodeType !== 1 || typeof node.appendChild !== 'function') return false
  if (typeof HTMLElement !== 'undefined' && value instanceof HTMLElement) return true
  // RN web can put Stripe nodes in a different realm than the app's HTMLElement.
  return typeof (value as { ownerDocument?: unknown }).ownerDocument !== 'undefined'
}

type OverlayHandlers =
  | (() => void)
  | {
      onOpen?: () => void
      onClosed: () => void
    }

/** Stripe Link / Identity sets aria-hidden on #root and injects popup iframes into the live document. */
export function watchExpressIdentityOverlay(handlers: OverlayHandlers): () => void {
  if (typeof document === 'undefined') return () => {}
  const onClosed = typeof handlers === 'function' ? handlers : handlers.onClosed
  const onOpen = typeof handlers === 'function' ? undefined : handlers.onOpen
  const root = document.getElementById('root')
  let sawOpen = false
  let opened = false
  let closed = false
  const fireClosed = () => {
    if (closed) return
    closed = true
    onClosed()
  }
  const check = () => {
    const hidden = root?.getAttribute('aria-hidden') === 'true'
    const overlay = document.querySelector(
      'iframe[src*="stripecdn.com"], iframe[src*="stripe.com/identity"], iframe[src*="gelato"]',
    )
    if (hidden || overlay) {
      if (!opened) {
        opened = true
        onOpen?.()
      }
      sawOpen = true
      return
    }
    if (sawOpen) fireClosed()
  }
  const mo = new MutationObserver(check)
  if (root) mo.observe(root, { attributes: true, attributeFilter: ['aria-hidden'] })
  mo.observe(document.body, { childList: true, subtree: true })
  const timer = window.setInterval(check, 400)
  return () => {
    window.clearInterval(timer)
    mo.disconnect()
  }
}

type OverlayHandlers =
  | (() => void)
  | {
      onOpen?: () => void
      onClosed: () => void
    }

function isStripePopupIframe(el: Element): boolean {
  if (!(el instanceof HTMLIFrameElement)) return false
  const src = el.src || ''
  if (/controller|deploy_status|henson|messages-/i.test(src)) return false
  if (!/stripecdn\.com|stripe\.com|gelato|js\.stripe\.com/i.test(src)) return false
  const rect = el.getBoundingClientRect()
  return rect.width > 80 && rect.height > 80
}

function stripeOverlayOpen(): boolean {
  const root = document.getElementById('root')
  if (root?.getAttribute('aria-hidden') === 'true') return true
  return Array.from(document.querySelectorAll('iframe')).some(isStripePopupIframe)
}

/** Identity iframe close means the user submitted or finished — not a cancel.
 *  Only the SDK `abandoned` callback should dismiss setup. */
export function watchExpressIdentityOverlay(handlers: OverlayHandlers): () => void {
  if (typeof document === 'undefined') return () => {}
  const onClosed = typeof handlers === 'function' ? handlers : handlers.onClosed
  const onOpen = typeof handlers === 'function' ? undefined : handlers.onOpen
  let sawOpen = false
  let opened = false
  let closed = false
  const fireClosed = () => {
    if (closed) return
    closed = true
    onClosed()
  }
  const check = () => {
    if (stripeOverlayOpen()) {
      if (!opened) {
        opened = true
        onOpen?.()
      }
      sawOpen = true
      return
    }
    if (sawOpen) fireClosed()
  }
  const root = document.getElementById('root')
  const mo = new MutationObserver(check)
  if (root) mo.observe(root, { attributes: true, attributeFilter: ['aria-hidden'] })
  mo.observe(document.body, { childList: true, subtree: true })
  const timer = window.setInterval(check, 250)
  return () => {
    window.clearInterval(timer)
    mo.disconnect()
  }
}

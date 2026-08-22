/** Stripe Identity sets aria-hidden on #root while the popup is open. */
export function watchExpressIdentityOverlay(onClosed: () => void): () => void {
  if (typeof document === 'undefined') return () => {}
  const root = document.getElementById('root')
  let sawOpen = false
  let closed = false
  const fire = () => {
    if (closed) return
    closed = true
    onClosed()
  }
  const check = () => {
    const hidden = root?.getAttribute('aria-hidden') === 'true'
    const overlay = document.querySelector(
      'iframe[src*="stripecdn.com"], iframe[src*="stripe.com/identity"], iframe[src*="gelato"]',
    )
    if (hidden || overlay) sawOpen = true
    else if (sawOpen) fire()
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

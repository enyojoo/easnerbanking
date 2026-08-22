const VISIBLE_ID = 'easner-express-onramp-host'
const HIDDEN_ID = 'easner-express-onramp-live'

let patched = false

function makeHost(id: string, hidden: boolean): HTMLElement | null {
  if (typeof document === 'undefined') return null
  let host = document.getElementById(id)
  if (!host) {
    host = document.createElement('div')
    host.id = id
    host.setAttribute('data-easner-express-onramp', hidden ? 'live' : 'visible')
    host.style.cssText = hidden
      ? 'position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0);left:-9999px'
      : 'position:fixed;inset:0;z-index:2147483000;background:#ffffff;overflow:auto;display:none'
    document.body.appendChild(host)
  }
  return host
}

function detachedRoot(node: Node): HTMLElement | null {
  let cur: Node = node
  while (cur.parentNode && !document.documentElement.contains(cur.parentNode)) {
    cur = cur.parentNode
  }
  return cur instanceof HTMLElement ? cur : null
}

function attachDetachedStripeFrame(iframe: HTMLIFrameElement, src: string): void {
  if (!/stripe\.com|stripecdn\.com/i.test(src)) return
  if (document.documentElement.contains(iframe)) return
  const root = detachedRoot(iframe)
  const hidden = makeHost(HIDDEN_ID, true)
  if (root && hidden && root !== hidden) hidden.appendChild(root)
}

function patchIframeSrc(): void {
  if (patched || typeof HTMLIFrameElement === 'undefined') return
  patched = true

  const desc = Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, 'src')
  if (desc?.set) {
    const origSet = desc.set
    Object.defineProperty(HTMLIFrameElement.prototype, 'src', {
      configurable: true,
      enumerable: desc.enumerable,
      get: desc.get,
      set(this: HTMLIFrameElement, value: string) {
        origSet.call(this, value)
        attachDetachedStripeFrame(this, String(value ?? ''))
      },
    })
  }

  const origSetAttribute = HTMLIFrameElement.prototype.setAttribute
  HTMLIFrameElement.prototype.setAttribute = function setAttribute(name: string, value: string) {
    origSetAttribute.call(this, name, value)
    if (String(name).toLowerCase() === 'src') attachDetachedStripeFrame(this, String(value ?? ''))
  }
}

/** Must run before Stripe injects its controller iframe. */
export function prepareExpressStripeWebDom(): void {
  makeHost(HIDDEN_ID, true)
  makeHost(VISIBLE_ID, false)
  patchIframeSrc()
}

export function mountExpressStripeElement(element: unknown): boolean {
  if (typeof document === 'undefined' || typeof HTMLElement === 'undefined') return false
  if (!(element instanceof HTMLElement)) return false
  const host = makeHost(VISIBLE_ID, false)
  if (!host) return false
  host.replaceChildren()
  host.appendChild(element)
  host.style.display = 'block'
  return true
}

export function hideExpressStripeHost(): void {
  if (typeof document === 'undefined') return
  const host = document.getElementById(VISIBLE_ID)
  if (!host) return
  host.replaceChildren()
  host.style.display = 'none'
}

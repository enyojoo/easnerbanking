import { EXPRESS_NATIVE_AUTH_REQUIRED, type ExpressOnrampSdk } from './express-onramp-types'

export { EXPRESS_NATIVE_AUTH_REQUIRED }
export type { ExpressOnrampSdk }

const SCRIPT_SRC = '/crypto-onramp/v1/crypto-onramp.js'
const SCRIPT_ID = 'easner-express-crypto-onramp'

type StripeLoader = (publishableKey: string, opts?: Record<string, unknown>) => Promise<ExpressOnrampSdk>

declare global {
  interface Window {
    loadCryptoOnrampAndInitialize?: StripeLoader
    loadStripeOnramp?: StripeLoader
  }
}

let cached: ExpressOnrampSdk | null = null
let inflight: Promise<ExpressOnrampSdk> | null = null
let scriptPromise: Promise<StripeLoader> | null = null

/** Native sheets are presented by Stripe; web UI is observed via the parent overlay watcher. */
export function subscribeExpressOnrampUi(_listener: (open: boolean) => void): () => void {
  return () => {}
}

export function hideExpressOnrampFrame(): void {}

function readLoader(): StripeLoader | null {
  if (typeof window === 'undefined') return null
  return window.loadCryptoOnrampAndInitialize || window.loadStripeOnramp || null
}

function ensureScript(): Promise<StripeLoader> {
  const existing = readLoader()
  if (existing) return Promise.resolve(existing)
  if (scriptPromise) return scriptPromise
  scriptPromise = new Promise((resolve, reject) => {
    const done = () => {
      const loader = readLoader()
      if (loader) {
        resolve(loader)
        return true
      }
      return false
    }
    if (done()) return
    let script = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null
    if (script && script.type !== 'module') {
      script.remove()
      script = null
    }
    if (!script) {
      script = document.createElement('script')
      script.id = SCRIPT_ID
      script.type = 'module'
      script.src = SCRIPT_SRC
      document.head.appendChild(script)
    }
    script.addEventListener('load', () => {
      if (!done()) reject(new Error('Express deposits is not available.'))
    })
    script.addEventListener('error', () => {
      scriptPromise = null
      reject(new Error('Express deposits is not available.'))
    })
  })
  return scriptPromise
}

export function prefetchMobileExpressOnramp(): void {
  if (typeof document === 'undefined') return
  void ensureScript().catch(() => undefined)
}

export async function loadMobileExpressOnramp(publishableKey: string): Promise<ExpressOnrampSdk> {
  if (cached) return cached
  if (inflight) return inflight
  inflight = (async () => {
    const loader = await ensureScript()
    cached = await loader(publishableKey, { theme: 'stripe' })
    return cached
  })()
  try {
    return await inflight
  } finally {
    inflight = null
  }
}

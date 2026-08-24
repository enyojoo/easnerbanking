import {
  EXPRESS_ONRAMP_APPEARANCE_REV,
  expressOnrampLinkConfigure,
  expressOnrampWebInitOptions,
} from '@easner/shared'
import { EXPRESS_NATIVE_AUTH_REQUIRED, type ExpressOnrampSdk } from './express-onramp-types'

export { EXPRESS_NATIVE_AUTH_REQUIRED }
export type { ExpressOnrampSdk }

/** Stripe requires this script from their domain so the controller iframe origin matches postMessage. */
const SCRIPT_SRC = 'https://js.stripe.com/crypto-onramp/v1/crypto-onramp.js'
const SCRIPT_ID = 'easner-express-crypto-onramp'

type StripeLoader = (publishableKey: string, opts?: Record<string, unknown>) => Promise<ExpressOnrampSdk>

type StripeClient = ExpressOnrampSdk & {
  ready?: Promise<unknown>
}

declare global {
  interface Window {
    loadCryptoOnrampAndInitialize?: StripeLoader
    loadStripeOnramp?: StripeLoader
  }
}

let cached: ExpressOnrampSdk | null = null
let cachedFor: string | null = null
let inflight: Promise<ExpressOnrampSdk> | null = null
let scriptPromise: Promise<StripeLoader> | null = null

async function tryConfigureWebOnramp(
  client: StripeClient,
  cryptoCustomerId?: string | null,
): Promise<void> {
  const configure = (client as { configure?: (config: Record<string, unknown>) => Promise<unknown> }).configure
  if (typeof configure !== 'function') return
  try {
    await configure(expressOnrampLinkConfigure(cryptoCustomerId) as Record<string, unknown>)
  } catch {
    // Some CDN builds omit configure(); init options still apply where supported.
  }
}

/** Bind Link session to the SDK only after authenticate() — avoids controller.html 403 spam. */
export async function configureExpressOnrampLinkSession(
  client: ExpressOnrampSdk,
  cryptoCustomerId?: string | null,
): Promise<void> {
  await tryConfigureWebOnramp(client as StripeClient, cryptoCustomerId)
}

/** Native sheets are presented by Stripe; web UI is observed via the parent overlay watcher. */
export function subscribeExpressOnrampUi(_listener: (open: boolean) => void): () => void {
  return () => {}
}

export function hideExpressOnrampFrame(): void {}

function readLoader(): StripeLoader | null {
  if (typeof window === 'undefined') return null
  return window.loadCryptoOnrampAndInitialize || window.loadStripeOnramp || null
}

function bindMethod<T extends (...args: never[]) => unknown>(
  client: StripeClient,
  method: T | undefined,
): T | undefined {
  if (!method) return undefined
  return method.bind(client) as T
}

/** CDN class methods throw "reading 'messenger'" if extracted without binding `this`. */
function bindClient(client: StripeClient): ExpressOnrampSdk {
  return {
    registerLinkUser: bindMethod(client, client.registerLinkUser),
    authenticate: bindMethod(client, client.authenticate),
    submitKycInfo: bindMethod(client, client.submitKycInfo),
    getMissingIdentifiers: bindMethod(client, client.getMissingIdentifiers),
    updateKycInfo: bindMethod(client, client.updateKycInfo),
    promptUserAttestation: bindMethod(client, client.promptUserAttestation),
    verifyDocuments: bindMethod(client, client.verifyDocuments),
    verifyIdentity: bindMethod(client, client.verifyIdentity),
    collectPaymentMethod: bindMethod(client, client.collectPaymentMethod),
    performCheckout: bindMethod(client, client.performCheckout),
  }
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
    if (script && (script.type !== 'module' || script.src !== SCRIPT_SRC)) {
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

export async function loadMobileExpressOnramp(
  publishableKey: string,
  _cryptoCustomerId?: string | null,
): Promise<ExpressOnrampSdk> {
  const cacheKey = `${publishableKey}:${EXPRESS_ONRAMP_APPEARANCE_REV}`
  if (cached && cachedFor === cacheKey) return cached
  if (inflight) return inflight
  inflight = (async () => {
    const loader = await ensureScript()
    const client = (await loader(publishableKey, expressOnrampWebInitOptions())) as StripeClient
    if (client.ready) await client.ready
    // Appearance only on load; bind cryptoCustomerId after Link authenticate().
    await tryConfigureWebOnramp(client, null)
    cachedFor = cacheKey
    cached = bindClient(client)
    return cached
  })()
  try {
    return await inflight
  } finally {
    inflight = null
  }
}

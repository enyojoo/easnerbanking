/**
 * Load Connect.js ourselves before `loadConnectAndInitialize`.
 *
 * `@stripe/connect-js` caches a single script-load promise. If that promise
 * rejects ("Failed to load Connect.js"), every later initialize reuses the
 * rejection — Try again cannot recover without a full page reload. Loading the
 * script first (and never ripping out a tag Stripe is still listening to)
 * keeps Stripe's loader on the success path.
 *
 * Callers must also `await awaitConnectJsInitialized(instance)` before mounting
 * Connect components. `loadConnectAndInitialize` leaves its internal promise
 * unhandled; `create()` / setters then `.then()` that promise without a catch,
 * which PostHog records as an unhandled "Failed to load Connect.js".
 */

export const CONNECT_JS_SRC = "https://connect-js.stripe.com/v1.0/connect.js"
export const CONNECT_JS_LOAD_ERROR = "Failed to load Connect.js"

type StripeConnectGlobal = {
  init?: (...args: unknown[]) => unknown
}

type ConnectInstanceLike = {
  debugInstance?: () => Promise<unknown>
}

let inflight: Promise<void> | null = null
let injectedScript: HTMLScriptElement | null = null

function stripeConnect(): StripeConnectGlobal | undefined {
  if (typeof window === "undefined") return undefined
  return (window as Window & { StripeConnect?: StripeConnectGlobal }).StripeConnect
}

export function isConnectJsReady(): boolean {
  return typeof stripeConnect()?.init === "function"
}

function existingConnectScript(): HTMLScriptElement | null {
  if (typeof document === "undefined") return null
  return document.querySelector<HTMLScriptElement>(`script[src="${CONNECT_JS_SRC}"]`)
}

function waitForConnectScript(script: HTMLScriptElement): Promise<void> {
  return new Promise((resolve, reject) => {
    if (isConnectJsReady()) {
      resolve()
      return
    }
    const onLoad = () => {
      cleanup()
      if (isConnectJsReady()) resolve()
      else reject(new Error("Connect.js did not load the necessary objects"))
    }
    const onError = () => {
      cleanup()
      reject(new Error(CONNECT_JS_LOAD_ERROR))
    }
    const cleanup = () => {
      script.removeEventListener("load", onLoad)
      script.removeEventListener("error", onError)
    }
    // Listeners must be attached before the script is inserted, or a cached
    // load/error can fire during appendChild and never be observed.
    script.addEventListener("load", onLoad)
    script.addEventListener("error", onError)
    if (isConnectJsReady()) {
      cleanup()
      resolve()
    }
  })
}

async function loadConnectJsScript(): Promise<void> {
  if (isConnectJsReady()) return

  const reusable =
    injectedScript?.isConnected && injectedScript.src === CONNECT_JS_SRC ? injectedScript : null
  if (reusable) {
    await waitForConnectScript(reusable)
    return
  }

  const script = document.createElement("script")
  script.async = true
  const pending = waitForConnectScript(script)
  script.src = CONNECT_JS_SRC
  injectedScript = script
  document.head.appendChild(script)
  try {
    await pending
  } catch (error) {
    script.remove()
    if (injectedScript === script) injectedScript = null
    throw error
  }
}

/** Resolve once Connect.js is on the page and `StripeConnect.init` exists. Safe to retry. */
export function ensureConnectJsLoaded(): Promise<void> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Connect.js can only load in the browser"))
  }
  if (isConnectJsReady()) return Promise.resolve()
  if (inflight) return inflight
  inflight = loadConnectJsScript().finally(() => {
    inflight = null
  })
  return inflight
}

/**
 * Attach to Stripe's internal init promise so a load failure is handled, and
 * so Connect components are not mounted until `StripeConnect.init` has run.
 */
export async function awaitConnectJsInitialized(instance: ConnectInstanceLike): Promise<void> {
  const debug = instance.debugInstance
  if (typeof debug !== "function") return
  await debug.call(instance)
}

export function prefetchConnectJs(): void {
  if (typeof window === "undefined") return
  void ensureConnectJsLoaded().catch(() => undefined)
}

export function __resetConnectJsLoaderForTests(): void {
  inflight = null
  injectedScript?.remove()
  injectedScript = null
  existingConnectScript()?.remove()
  if (typeof window !== "undefined") {
    delete (window as Window & { StripeConnect?: StripeConnectGlobal }).StripeConnect
  }
}

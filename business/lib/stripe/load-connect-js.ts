/**
 * Load Connect.js ourselves before `loadConnectAndInitialize`.
 *
 * `@stripe/connect-js` caches a single script-load promise. If that promise
 * rejects ("Failed to load Connect.js"), every later initialize reuses the
 * rejection — Try again cannot recover without a full page reload. Loading the
 * script first (and removing a failed tag on retry) keeps Stripe's loader on
 * the success path.
 */

export const CONNECT_JS_SRC = "https://connect-js.stripe.com/v1.0/connect.js"
export const CONNECT_JS_LOAD_ERROR = "Failed to load Connect.js"

type StripeConnectGlobal = {
  init?: (...args: unknown[]) => unknown
}

let inflight: Promise<void> | null = null

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
    script.addEventListener("load", onLoad)
    script.addEventListener("error", onError)
  })
}

async function loadConnectJsScript(): Promise<void> {
  if (isConnectJsReady()) return

  existingConnectScript()?.remove()

  const script = document.createElement("script")
  script.src = CONNECT_JS_SRC
  script.async = true
  document.head.appendChild(script)
  try {
    await waitForConnectScript(script)
  } catch (error) {
    script.remove()
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

export function prefetchConnectJs(): void {
  if (typeof window === "undefined") return
  void ensureConnectJsLoaded().catch(() => undefined)
}

export function __resetConnectJsLoaderForTests(): void {
  inflight = null
  existingConnectScript()?.remove()
  if (typeof window !== "undefined") {
    delete (window as Window & { StripeConnect?: StripeConnectGlobal }).StripeConnect
  }
}

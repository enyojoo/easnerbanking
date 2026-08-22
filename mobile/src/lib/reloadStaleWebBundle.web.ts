const STORAGE_KEY = 'easner.web.stale-bundle-reload'

export function clearStaleWebBundleReloadFlag(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY)
  } catch {
    // private mode
  }
}

/** After a deploy, open tabs still request old hashed `/_expo/static` chunks. */
export function reloadOnceForStaleWebBundle(): void {
  try {
    if (sessionStorage.getItem(STORAGE_KEY)) return
    sessionStorage.setItem(STORAGE_KEY, '1')
  } catch {
    return
  }
  window.location.reload()
}

function isHtmlServedAsJs(message: string): boolean {
  return message.includes("Unexpected token '<'")
}

function isFailedExpoChunkFetch(message: string): boolean {
  return /Failed to fetch dynamically imported module|error loading dynamically imported module|Loading chunk/i.test(
    message,
  )
}

function isExpoStaticScript(src: string): boolean {
  return /\/_expo\/static\/.+\.js(?:\?|$)/.test(src)
}

export function installStaleWebBundleReload(): void {
  // Resource load failures do not bubble; listen in capture.
  window.addEventListener(
    'error',
    (event) => {
      const target = event.target
      if (target instanceof HTMLScriptElement && isExpoStaticScript(target.src)) {
        reloadOnceForStaleWebBundle()
        return
      }
      if (event.target !== window && event.target != null) return
      if (isHtmlServedAsJs(String(event.message || ''))) {
        reloadOnceForStaleWebBundle()
      }
    },
    true,
  )
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason
    const message = reason instanceof Error ? reason.message : String(reason || '')
    if (isHtmlServedAsJs(message) || isFailedExpoChunkFetch(message)) {
      reloadOnceForStaleWebBundle()
    }
  })
}

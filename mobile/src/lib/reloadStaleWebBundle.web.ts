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

function shouldReload(message: string, filename: string): boolean {
  if (message.includes("Unexpected token '<'")) return true
  if (message.includes('unknown module')) return true
  return /\/_expo\/static\/.+\.js(?:\?|$)/.test(filename)
}

export function installStaleWebBundleReload(): void {
  window.addEventListener('error', (event) => {
    const target = event.target
    const src =
      event.filename ||
      (target instanceof HTMLScriptElement ? target.src : '') ||
      ''
    if (shouldReload(String(event.message || ''), src)) {
      reloadOnceForStaleWebBundle()
    }
  })
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason
    const message = reason instanceof Error ? reason.message : String(reason || '')
    if (shouldReload(message, '')) {
      reloadOnceForStaleWebBundle()
    }
  })
}

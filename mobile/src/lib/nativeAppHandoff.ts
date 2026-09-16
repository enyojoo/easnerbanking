/**
 * After SES click-tracking redirects (or when Mail/Gmail opens HTTPS in a
 * browser), land on app.easner.com and hop into the installed native app via
 * the `easner://` custom scheme. Universal Links never fire on a redirect hop.
 */

/** Cold-load paths that emails use as CTAs. Do not include /user/dashboard — that is the web app home. */
const EMAIL_DEEP_LINK_PATH = /^\/user\/transactions\/[^/]+|^\/payroll(\/|$)/

export function nativeAppUrlFromHttpsPath(pathname: string, search = '', hash = ''): string | null {
  const path = pathname.startsWith('/') ? pathname : `/${pathname}`
  if (!/^\/(user|payroll)(\/|$)/.test(path)) return null
  return `easner://${path.replace(/^\//, '')}${search}${hash}`
}

export function shouldHandoffHttpsToNativeApp(input: {
  pathname: string
  search?: string
  referrer?: string
  userAgent?: string
  displayModeStandalone?: boolean
}): boolean {
  if (input.displayModeStandalone) return false
  const ua = input.userAgent ?? ''
  if (!/iPhone|iPad|iPod|Android/i.test(ua)) return false
  const params = new URLSearchParams((input.search ?? '').replace(/^\?/, ''))
  if (params.get('web') === '1') return false
  const path = input.pathname.startsWith('/') ? input.pathname : `/${input.pathname}`
  if (!/^\/(user|payroll)(\/|$)/.test(path)) return false
  const fromSesTrack = /awstrack\.me|amazonses\.com/i.test(input.referrer ?? '')
  return fromSesTrack || EMAIL_DEEP_LINK_PATH.test(path)
}

export function maybeHandoffHttpsToNativeApp(): void {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return
  const standalone =
    window.matchMedia?.('(display-mode: standalone)').matches === true ||
    ('standalone' in navigator && Boolean((navigator as Navigator & { standalone?: boolean }).standalone))
  if (
    !shouldHandoffHttpsToNativeApp({
      pathname: window.location.pathname,
      search: window.location.search,
      referrer: document.referrer,
      userAgent: navigator.userAgent,
      displayModeStandalone: standalone,
    })
  ) {
    return
  }
  const native = nativeAppUrlFromHttpsPath(
    window.location.pathname,
    window.location.search,
    window.location.hash,
  )
  if (!native) return
  window.location.assign(native)
}

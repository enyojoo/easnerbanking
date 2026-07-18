/** When true, do not let React Navigation rewrite `/user/*` URLs to `/auth` during session restore. */
let preserveUserPathOverAuth = false

export function setPreserveUserPathOverAuth(preserve: boolean): void {
  preserveUserPathOverAuth = preserve
}

export function shouldPreserveUserPathOverAuth(nextPath: string): boolean {
  if (!preserveUserPathOverAuth || typeof window === 'undefined') return false
  const normalized = nextPath.replace(/^\//, '').toLowerCase()
  if (normalized !== 'auth') return false
  return window.location.pathname.startsWith('/user/')
}

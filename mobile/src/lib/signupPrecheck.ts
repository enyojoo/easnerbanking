import { getApiBaseUrl } from './apiClient'

export type SignupPrecheckResult = { ok: true } | { ok: false; code?: string; error: string }

/**
 * Pre-sign-up gate against the business backend (no session required). Mirrors the business web
 * check: blocks disposable email domains and emails already registered on the Business surface.
 * Fails open on network/parse errors so a flaky connection never blocks a legitimate sign-up.
 */
export async function signupPrecheck(email: string): Promise<SignupPrecheckResult> {
  try {
    const res = await fetch(`${getApiBaseUrl()}/api/auth/signup-precheck`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email.trim(), surface: 'consumer_mobile' }),
    })
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; code?: string; error?: string }
    if (data?.ok === false) {
      return { ok: false, code: data.code, error: data.error || "This email can't be used to sign up." }
    }
    return { ok: true }
  } catch {
    return { ok: true }
  }
}

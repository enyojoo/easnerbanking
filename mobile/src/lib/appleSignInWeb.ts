import Constants from 'expo-constants'

const APPLE_SCRIPT_SRC =
  'https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js'

type AppleUserName = {
  firstName?: string
  lastName?: string
}

type AppleWebSignInResult = {
  idToken: string
  rawNonce: string
  fullName?: string
}

type AppleAuthResponse = {
  authorization?: {
    id_token?: string
  }
  user?: {
    name?: AppleUserName
  }
}

type AppleAuthError = {
  error?: string
}

declare global {
  interface Window {
    AppleID?: {
      auth: {
        init: (config: {
          clientId: string
          scope: string
          redirectURI: string
          usePopup: boolean
          nonce: string
        }) => void
        signIn: () => Promise<AppleAuthResponse>
      }
    }
  }
}

let scriptLoadPromise: Promise<void> | null = null

export function getAppleWebClientId(): string {
  const extra = Constants.expoConfig?.extra as { appleWebClientId?: string } | undefined
  return (
    extra?.appleWebClientId?.trim() ||
    process.env.EXPO_PUBLIC_APPLE_WEB_CLIENT_ID?.trim() ||
    ''
  )
}

async function sha256Hex(value: string): Promise<string> {
  const data = new TextEncoder().encode(value)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

function loadAppleIdScript(): Promise<void> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Sign in with Apple is only available in a browser.'))
  }
  if (window.AppleID?.auth) return Promise.resolve()

  if (!scriptLoadPromise) {
    scriptLoadPromise = new Promise((resolve, reject) => {
      const existing = document.querySelector<HTMLScriptElement>(`script[src="${APPLE_SCRIPT_SRC}"]`)
      if (existing) {
        existing.addEventListener('load', () => resolve(), { once: true })
        existing.addEventListener(
          'error',
          () => reject(new Error('Failed to load Sign in with Apple.')),
          { once: true },
        )
        return
      }

      const script = document.createElement('script')
      script.src = APPLE_SCRIPT_SRC
      script.async = true
      script.onload = () => resolve()
      script.onerror = () => reject(new Error('Failed to load Sign in with Apple.'))
      document.head.appendChild(script)
    })
  }

  return scriptLoadPromise
}

function isAppleSignInCancelled(error: unknown): boolean {
  const code = (error as AppleAuthError | null)?.error
  return code === 'popup_closed_by_user' || code === 'user_cancelled_authorize'
}

function formatAppleFullName(name?: AppleUserName): string | undefined {
  if (!name) return undefined
  const parts = [name.firstName, name.lastName].filter(Boolean)
  return parts.length > 0 ? parts.join(' ') : undefined
}

/**
 * Expo web Sign in with Apple via Apple JS + Supabase `signInWithIdToken`.
 * Does not use Supabase OAuth (no Apple client secret required).
 */
export async function signInWithAppleWeb(): Promise<AppleWebSignInResult> {
  const clientId = getAppleWebClientId()
  if (!clientId) {
    throw new Error(
      'Apple web sign-in is not configured. Set EXPO_PUBLIC_APPLE_WEB_CLIENT_ID to your Apple Services ID and add it under Supabase Auth → Apple → Client IDs.',
    )
  }

  if (typeof window === 'undefined') {
    throw new Error('Sign in with Apple is only available in a browser.')
  }

  await loadAppleIdScript()

  const rawNonce = crypto.randomUUID()
  const hashedNonce = await sha256Hex(rawNonce)
  const redirectURI = `${window.location.origin}/auth/callback`

  window.AppleID!.auth.init({
    clientId,
    scope: 'name email',
    redirectURI,
    usePopup: true,
    nonce: hashedNonce,
  })

  let response: AppleAuthResponse
  try {
    response = await window.AppleID!.auth.signIn()
  } catch (error) {
    if (isAppleSignInCancelled(error)) {
      throw new Error('ERR_APPLE_SIGN_IN_CANCELED')
    }
    throw error instanceof Error ? error : new Error('Unable to continue with Apple.')
  }

  const idToken = response.authorization?.id_token
  if (!idToken) {
    throw new Error('Apple sign-in did not return an identity token.')
  }

  return {
    idToken,
    rawNonce,
    fullName: formatAppleFullName(response.user?.name),
  }
}

export function isAppleWebSignInCanceled(error: unknown): boolean {
  return error instanceof Error && error.message === 'ERR_APPLE_SIGN_IN_CANCELED'
}

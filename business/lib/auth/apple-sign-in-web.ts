const APPLE_SCRIPT_SRC =
  "https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js"

export const DEFAULT_BUSINESS_APPLE_WEB_CLIENT_ID = "com.easner.business.web"

type AppleUserName = {
  firstName?: string
  lastName?: string
}

export type BusinessAppleWebSignInResult = {
  idToken: string
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
  error_description?: string
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
        }) => void
        signIn: () => Promise<AppleAuthResponse>
      }
    }
  }
}

let scriptLoadPromise: Promise<void> | null = null

export function getBusinessAppleWebClientId(): string {
  return (
    process.env.NEXT_PUBLIC_APPLE_WEB_CLIENT_ID?.trim() ||
    process.env.NEXT_PUBLIC_BUSINESS_APPLE_WEB_CLIENT_ID?.trim() ||
    DEFAULT_BUSINESS_APPLE_WEB_CLIENT_ID
  )
}

export function getBusinessAppleWebRedirectUri(): string {
  if (typeof window === "undefined") {
    return "https://business.easner.com/auth/callback"
  }

  const override = process.env.NEXT_PUBLIC_APPLE_WEB_REDIRECT_URI?.trim()
  if (override) return override.replace(/\/$/, "")

  return `${window.location.origin}/auth/callback`.replace(/\/$/, "")
}

function formatAppleAuthFailure(error: unknown, clientId: string, redirectURI: string): Error {
  const appleError = error as AppleAuthError | null
  const code = appleError?.error
  const description = appleError?.error_description

  if (code === "invalid_client") {
    return new Error(
      `Apple rejected the web client ID "${clientId}". Enable Sign in with Apple for that Services ID in Apple Developer, set domain and return URL ${redirectURI}, then add the Services ID under Supabase Auth → Apple → Client IDs.`,
    )
  }

  if (code === "invalid_request" && description?.toLowerCase().includes("redirect")) {
    return new Error(
      `Apple rejected the redirect URI "${redirectURI}". Add this exact return URL to your Services ID in Apple Developer.`,
    )
  }

  if (description) return new Error(description)
  if (error instanceof Error) return error
  return new Error("Unable to continue with Apple.")
}

function loadAppleIdScript(): Promise<void> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Sign in with Apple is only available in a browser."))
  }
  if (window.AppleID?.auth) return Promise.resolve()

  if (!scriptLoadPromise) {
    scriptLoadPromise = new Promise((resolve, reject) => {
      const existing = document.querySelector<HTMLScriptElement>(`script[src="${APPLE_SCRIPT_SRC}"]`)
      if (existing) {
        existing.addEventListener("load", () => resolve(), { once: true })
        existing.addEventListener(
          "error",
          () => reject(new Error("Failed to load Sign in with Apple.")),
          { once: true },
        )
        return
      }

      const script = document.createElement("script")
      script.src = APPLE_SCRIPT_SRC
      script.async = true
      script.onload = () => resolve()
      script.onerror = () => reject(new Error("Failed to load Sign in with Apple."))
      document.head.appendChild(script)
    })
  }

  return scriptLoadPromise
}

function isAppleSignInCancelled(error: unknown): boolean {
  const code = (error as AppleAuthError | null)?.error
  return code === "popup_closed_by_user" || code === "user_cancelled_authorize"
}

function formatAppleFullName(name?: AppleUserName): string | undefined {
  if (!name) return undefined
  const parts = [name.firstName, name.lastName].filter(Boolean)
  return parts.length > 0 ? parts.join(" ") : undefined
}

/** Business web Sign in with Apple via Apple JS + Supabase `signInWithIdToken`. */
export async function signInWithAppleWeb(): Promise<BusinessAppleWebSignInResult> {
  const clientId = getBusinessAppleWebClientId()
  if (typeof window === "undefined") {
    throw new Error("Sign in with Apple is only available in a browser.")
  }

  await loadAppleIdScript()

  const redirectURI = getBusinessAppleWebRedirectUri()

  window.AppleID!.auth.init({
    clientId,
    scope: "name email",
    redirectURI,
    usePopup: true,
  })

  let response: AppleAuthResponse
  try {
    response = await window.AppleID!.auth.signIn()
  } catch (error) {
    if (isAppleSignInCancelled(error)) {
      throw new Error("ERR_APPLE_SIGN_IN_CANCELED")
    }
    throw formatAppleAuthFailure(error, clientId, redirectURI)
  }

  const idToken = response.authorization?.id_token
  if (!idToken) {
    throw new Error("Apple sign-in did not return an identity token.")
  }

  return {
    idToken,
    fullName: formatAppleFullName(response.user?.name),
  }
}

export function isAppleWebSignInCanceled(error: unknown): boolean {
  return error instanceof Error && error.message === "ERR_APPLE_SIGN_IN_CANCELED"
}

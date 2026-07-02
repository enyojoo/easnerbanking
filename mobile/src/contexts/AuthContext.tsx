import React, { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react'
import { Platform } from 'react-native'
import * as Linking from 'expo-linking'
import {
  isUserDeepLinkUrl,
  stashPendingDeepLinkFromUrl,
} from '../lib/pendingDeepLinkNavigation'
import { makeRedirectUri } from 'expo-auth-session'
import * as WebBrowser from 'expo-web-browser'
import * as AppleAuthentication from 'expo-apple-authentication'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { supabase, clearInvalidPersistedAuthSession } from '../lib/supabase'
import { getSessionReliable } from '../lib/authSession'
import { User, AuthUser } from '../types'
import type { User as SupabaseUser } from '@supabase/supabase-js'
import { analytics } from '../lib/analytics'
import { ensureBusinessAppUserBootstrap, getApiBaseUrl } from '../lib/apiClient'
import { clearJurisdictionCountryPolicyCache } from '../lib/jurisdictionCountryPolicy'
import { clearPinAuth, updateSessionActivity, markFirstLoginAfterVerification } from '../lib/pinAuth'
import { AUTH_INITIAL_MODE_KEY } from '../constants/auth'
import {
  getVerifiedTotpFactorId,
  resolvePostSignInMfaRequirement,
  totpFactorsFromListResponse,
  clearIncompleteMfaSessionOnColdStart,
} from '../lib/auth-mfa'
import { buildVerifiedIdentityFromKycFields } from '@easner/shared'
import { mapUsersRowToUser, splitFullNameForForm } from '../lib/userProfileHelpers'
import type { PersonalSettingsPayload } from '../lib/userService'
import { ensureConsumerMobileAccess } from '../lib/validateAppSurface'
import { hydratePayoutCorridorsFromStorage, refreshPayoutCorridors } from '../lib/payoutCorridors'
import { readProfileSnapshot, writeProfileSnapshot } from '../lib/profileSnapshot'
import { clearMfaVerified } from '../lib/mfaStatusCache'
import { warmAvatarCache, warmAvatarCacheAsync } from '../lib/avatarCache'
import Constants from 'expo-constants'
import { syncIntercomSession } from '../lib/intercom'
import { isAppleWebSignInCanceled, signInWithAppleWeb } from '../lib/appleSignInWeb'

// Completes the auth session on web popup flows. Native deep links are handled below.
WebBrowser.maybeCompleteAuthSession()

async function finalizePostAuthSession(options?: {
  noSessionMessage?: string
}): Promise<{ error: Error | null }> {
  let session = await getSessionReliable()

  if (!session?.access_token) {
    const started = Date.now()
    while (Date.now() - started < 20_000) {
      // eslint-disable-next-line no-await-in-loop
      await new Promise((r) => setTimeout(r, 150))
      // eslint-disable-next-line no-await-in-loop
      session = await getSessionReliable()
      if (session?.access_token) break
    }
  }
  if (!session?.access_token) {
    return {
      error: new Error(
        options?.noSessionMessage ?? 'Sign-in did not create a session in the app.',
      ),
    }
  }

  const boot = await ensureBusinessAppUserBootstrap()
  if (!boot.ok) {
    await supabase.auth.signOut({ scope: 'local' }).catch(() => undefined)
    return {
      error: new Error(
        `Account setup failed (bootstrap). API=${getApiBaseUrl()} status=${boot.status ?? 'n/a'}`,
      ),
    }
  }

  const surfaceGate = await ensureConsumerMobileAccess()
  if (surfaceGate.error) {
    const msg = surfaceGate.error.message || 'This account cannot use the Easner mobile app.'
    await supabase.auth.signOut({ scope: 'local' }).catch(() => undefined)
    return { error: new Error(msg) }
  }

  const { data: userRow, error: userRowErr } = await supabase
    .from('users')
    .select('id,role')
    .eq('id', session.user.id)
    .maybeSingle()
  if (userRowErr) {
    await supabase.auth.signOut({ scope: 'local' }).catch(() => undefined)
    return { error: new Error(userRowErr.message || 'Could not load your user profile.') }
  }
  if (!userRow?.id) {
    await supabase.auth.signOut({ scope: 'local' }).catch(() => undefined)
    return { error: new Error('Account setup did not create a user profile row. Please try again.') }
  }

  return { error: null }
}

function getOAuthRedirectUri(): string {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    return `${window.location.origin}/auth/callback`
  }
  return makeRedirectUri({ scheme: 'easner', path: 'auth/callback' })
}

/** True when we asked for a native deep link but Supabase substituted an https Site URL. */
function isProbablySupabaseSiteUrlFallbackRedirect(
  redirectToInAuthUrl: string | null | undefined,
  requestedRedirectTo: string,
): boolean {
  if (!redirectToInAuthUrl) return false
  if (redirectToInAuthUrl === requestedRedirectTo) return false
  return (
    !/^https?:\/\//i.test(requestedRedirectTo) && /^https?:\/\//i.test(redirectToInAuthUrl)
  )
}

function parseAuthCallbackUrl(url: string): {
  code: string | null
  accessToken: string | null
  refreshToken: string | null
  error: string | null
  errorDescription: string | null
} {
  // Supabase can return different shapes depending on flow / provider callback:
  // - PKCE: `?code=...`
  // - Some native redirects: tokens in the URL hash `#access_token=...&refresh_token=...`
  const tryParse = (raw: string) => {
    const parsed = Linking.parse(raw)
    return (parsed.queryParams ?? {}) as Record<string, unknown>
  }

  const qp1 = tryParse(url)

  let qp2: Record<string, unknown> = {}
  try {
    const hashIdx = url.indexOf('#')
    if (hashIdx >= 0) {
      const frag = url.slice(hashIdx + 1)
      // `Linking.parse` expects a scheme; a bare fragment is not parseable, so prefix a dummy.
      qp2 = tryParse(`easner://auth/callback?${frag}`)
    }
  } catch {
    qp2 = {}
  }

  const qp: Record<string, unknown> = { ...qp1, ...qp2 }

  const code = typeof qp.code === 'string' ? qp.code : null
  const accessToken = typeof qp.access_token === 'string' ? qp.access_token : null
  const refreshToken = typeof qp.refresh_token === 'string' ? qp.refresh_token : null
  const error = typeof qp.error === 'string' ? qp.error : null
  const errorDescription =
    typeof qp.error_description === 'string'
      ? qp.error_description
      : typeof qp.errorDescription === 'string'
        ? qp.errorDescription
        : null
  return { code, accessToken, refreshToken, error, errorDescription }
}

function patchAuthUserWithPersonal(
  prev: AuthUser,
  personal: PersonalSettingsPayload,
  options?: { easetag?: string },
): AuthUser {
  const names = splitFullNameForForm(personal.fullName || null)
  const easetagPart =
    options && 'easetag' in options
      ? {
          easetag:
            String(options.easetag ?? '')
              .replace(/^@/, '')
              .trim()
              .toLowerCase() || undefined,
        }
      : {}
  const profile: User = {
    ...prev.profile,
    full_name: personal.fullName?.trim() || null,
    first_name: names.firstName,
    middle_name: names.middleName || undefined,
    last_name: names.lastName,
    email: personal.email?.trim() || prev.profile.email,
    phone: personal.phone ?? prev.profile.phone ?? null,
    date_of_birth: personal.dateOfBirth || null,
    avatar_url: personal.avatarUrl,
    ...easetagPart,
  }
  return {
    ...prev,
    email: personal.email?.trim() || prev.email,
    profile,
  }
}

function mapNameFromMetadata(meta: Record<string, unknown> | undefined): {
  first_name: string
  last_name: string
} {
  const nameStr = typeof meta?.name === 'string' ? meta.name.trim() : ''
  if (!nameStr) {
    return {
      first_name: typeof meta?.first_name === 'string' ? meta.first_name : '',
      last_name: typeof meta?.last_name === 'string' ? meta.last_name : '',
    }
  }
  const parts = nameStr.split(/\s+/).filter(Boolean)
  return {
    first_name: parts[0] ?? '',
    last_name: parts.slice(1).join(' ') ?? '',
  }
}

interface AuthContextType {
  user: User | null
  userProfile: AuthUser | null
  loading: boolean
  /** Set after password sign-in when AAL1→AAL2 is required; cleared after successful TOTP verify or sign-out. */
  mfaPending: { factorId: string } | null
  /** False while post-sign-in MFA requirement is being resolved — blocks PIN until known. */
  mfaGateResolved: boolean
  signIn: (email: string, password: string, rememberMe?: boolean) => Promise<{ error: any }>
  signInWithGoogle: () => Promise<{ error: Error | null }>
  signInWithApple: () => Promise<{ error: Error | null }>
  resendSignupOtp: (email: string) => Promise<{ error: Error | null }>
  verifySignupOtp: (email: string, otp: string) => Promise<{ error: Error | null }>
  verifyMfa: (code: string) => Promise<{ error: Error | null }>
  cancelMfaSignIn: () => Promise<void>
  signUp: (
    email: string,
    password: string,
    name: string
  ) => Promise<{ error: any; needsEmailConfirmation?: boolean }>
  signOut: () => Promise<void>
  refreshUserProfile: () => Promise<void>
  /** Merge `PUT/GET /api/settings/personal` payload into session + snapshot (avoids stale Supabase read after save). */
  applyPersonalSettingsFromServer: (
    personal: PersonalSettingsPayload,
    options?: { easetag?: string },
  ) => void
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}

function mapSessionUser(sessionUser: SupabaseUser): User {
  const { first_name, last_name } = mapNameFromMetadata(sessionUser.user_metadata)
  return {
    id: sessionUser.id,
    email: sessionUser.email || '',
    full_name: [first_name, last_name].filter(Boolean).join(' ') || null,
    first_name,
    last_name,
    phone: sessionUser.phone ?? undefined,
    status: 'active',
    base_currency: 'USD',
    enabled_extra_account_currencies: [],
    created_at: sessionUser.created_at,
    updated_at: sessionUser.updated_at || sessionUser.created_at,
  }
}

/** Load profile snapshot + prefetch avatar before PIN / dashboard first paint. */
async function hydrateSessionUserFromSnapshot(userId: string): Promise<AuthUser | null> {
  const snap = await readProfileSnapshot(userId)
  if (!snap || snap.id !== userId) return null
  await warmAvatarCacheAsync(snap.profile.avatar_url)
  return snap
}

interface AuthProviderProps {
  children: ReactNode
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null)
  const [userProfile, setUserProfile] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [mfaPending, setMfaPending] = useState<{ factorId: string } | null>(null)
  const [mfaGateResolved, setMfaGateResolved] = useState(true)
  const profileFetchInFlightRef = useRef<Set<string>>(new Set())
  const userProfileRef = useRef<AuthUser | null>(null)
  /** When `refreshUserProfile` runs while a fetch is in flight, run one more fetch after the current one finishes. */
  const profileFetchPendingRef = useRef(false)
  /** Throttle automatic profile refetches (auth listener) for the same user; explicit `force` bypasses. */
  const lastAutoProfileFetchAtRef = useRef<Record<string, number>>({})
  const mfaGateSyncRef = useRef<Promise<'none' | 'pending' | 'missing_factor'> | null>(null)
  /** Avoid re-opening the MFA loading gate when SIGNED_IN fires after signIn already hydrated the same user. */
  const mfaHydratedUserIdRef = useRef<string | null>(null)
  const mfaPendingRef = useRef<{ factorId: string } | null>(null)
  /** Avoid repeated payout-corridor hydration (and dev Metro re-bundling) on every profile refetch. */
  const payoutCorridorsBootstrappedForUserRef = useRef<string | null>(null)
  const oauthConsumeInFlightRef = useRef(false)

  useEffect(() => {
    userProfileRef.current = userProfile
  }, [userProfile])

  useEffect(() => {
    mfaPendingRef.current = mfaPending
  }, [mfaPending])

  const syncMfaGateFromSession = useCallback(async (): Promise<'none' | 'pending' | 'missing_factor'> => {
    /** User is mid OTP entry — do not re-sync (avoids loading-shell flicker on app resume). */
    if (mfaPendingRef.current) {
      return 'pending'
    }
    if (mfaGateSyncRef.current) {
      return mfaGateSyncRef.current
    }
    setMfaGateResolved(false)
    const run = (async (): Promise<'none' | 'pending' | 'missing_factor'> => {
      try {
        const { needsOtp, error: aalErr } = await resolvePostSignInMfaRequirement(supabase)
        if (aalErr) {
          console.warn('AuthContext: MFA AAL error', aalErr.message)
          setMfaPending(null)
          return 'none'
        }
        if (!needsOtp) {
          setMfaPending(null)
          return 'none'
        }
        const { data: factors, error: facErr } = await supabase.auth.mfa.listFactors()
        if (facErr || !factors) {
          setMfaPending(null)
          return 'none'
        }
        const fid = getVerifiedTotpFactorId(totpFactorsFromListResponse(factors))
        if (!fid) {
          await supabase.auth.signOut()
          setUser(null)
          setUserProfile(null)
          payoutCorridorsBootstrappedForUserRef.current = null
          setMfaPending(null)
          setLoading(false)
          return 'missing_factor'
        }
        setMfaPending({ factorId: fid })
        return 'pending'
      } finally {
        setMfaGateResolved(true)
      }
    })()

    mfaGateSyncRef.current = run
    void run.finally(() => {
      if (mfaGateSyncRef.current === run) {
        mfaGateSyncRef.current = null
      }
    })
    return run
  }, [])

  const markSessionUserHydrated = useCallback((userId: string) => {
    if (mfaHydratedUserIdRef.current !== userId && !mfaPendingRef.current) {
      setMfaGateResolved(false)
    }
    mfaHydratedUserIdRef.current = userId
  }, [])

  const clearSessionUserHydrated = useCallback(() => {
    mfaHydratedUserIdRef.current = null
  }, [])

  const verifyMfa = useCallback(
    async (code: string): Promise<{ error: Error | null }> => {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (!session?.user) {
        return { error: new Error('Your session expired. Sign in again.') }
      }
      const digits = code.replace(/\D/g, '')
      if (digits.length !== 6) {
        return { error: new Error('Enter the 6-digit code from your authenticator app.') }
      }
      /**
       * Do not skip `mfa.verify` based on `getAuthenticatorAssuranceLevel()` alone.
       * After password sign-in, GoTrue can briefly report AAL in a state where `isMfaStepRequired`
       * is false even though the session is still AAL1 — that path cleared MFA without verifying
       * and accepted any 6-digit code. Always challenge + verify the submitted code here.
       */
      const { data: factors, error: facErr } = await supabase.auth.mfa.listFactors()
      if (facErr || !factors) {
        return { error: new Error(facErr?.message || 'Could not load two-factor settings.') }
      }
      const factorId = getVerifiedTotpFactorId(totpFactorsFromListResponse(factors))
      if (!factorId) {
        return {
          error: new Error(
            'Additional verification is required, but no authenticator was found. Contact support.',
          ),
        }
      }
      const { data: ch, error: chErr } = await supabase.auth.mfa.challenge({ factorId })
      if (chErr || !ch?.id) {
        return { error: new Error(chErr?.message || 'Could not start verification.') }
      }
      const { error: vErr } = await supabase.auth.mfa.verify({
        factorId,
        challengeId: ch.id,
        code: digits,
      })
      if (vErr) {
        return { error: new Error(vErr.message || 'Invalid code.') }
      }
      const surfaceGate = await ensureConsumerMobileAccess()
      if (surfaceGate.error) {
        return { error: surfaceGate.error }
      }
      /** After surface is OK — avoids a blank frame: clearing MFA before this left AppNavigator without MfaStack while still awaiting network. */
      setMfaPending(null)
      return { error: null }
    },
    [],
  )

  const verifySignupOtp = useCallback(async (email: string, otp: string): Promise<{ error: Error | null }> => {
    try {
      const digits = String(otp || '').replace(/\D/g, '').slice(0, 6)
      if (digits.length !== 6) {
        return { error: new Error('Enter the 6-digit code from your email.') }
      }
      const { error } = await supabase.auth.verifyOtp({
        email: email.trim(),
        token: digits,
        type: 'signup',
      })
      if (error) return { error: new Error(error.message || 'Invalid verification code.') }

      // Surface gate as soon as the session exists; PIN gate will happen in AppNavigator.
      const surfaceGate = await ensureConsumerMobileAccess()
      if (surfaceGate.error) return { error: surfaceGate.error }

      return { error: null }
    } catch (e) {
      return { error: e instanceof Error ? e : new Error('Unable to verify code.') }
    }
  }, [])

  const fetchUserProfile = async (
    userId: string,
    user?: any,
    opts?: { force?: boolean; sourceEvent?: string },
  ) => {
    /** Belt-and-suspenders: never pull `public.users` on token rotation (no identity change). */
    if (opts?.sourceEvent === 'TOKEN_REFRESHED') {
      return null
    }
    if (mfaPendingRef.current) {
      return null
    }
    if (profileFetchInFlightRef.current.has(userId)) {
      profileFetchPendingRef.current = true
      return null
    }
    const force = opts?.force === true
    if (!force) {
      const last = lastAutoProfileFetchAtRef.current[userId] ?? 0
      const minGapMs = 25_000
      if (Date.now() - last < minGapMs) {
        return null
      }
    }
    profileFetchInFlightRef.current.add(userId)

    try {
      if (__DEV__) {
        console.log('AuthContext: Fetching user profile for userId:', userId)
      }

      const {
        data: { session: gateSession },
      } = await supabase.auth.getSession()
      if (!gateSession?.user?.id || gateSession.user.id !== userId) {
        return null
      }

      const boot = await ensureBusinessAppUserBootstrap()
      if (!boot.ok) {
        console.warn('AuthContext: user bootstrap failed:', boot.status, boot.errorText)
      }

      const surfaceGate = await ensureConsumerMobileAccess()
      if (surfaceGate.error) {
        /** Session not hydrated yet — never clear user; profile fetch will run again. */
        if (surfaceGate.error.message === 'Unauthorized') {
          return null
        }
        console.warn('AuthContext: App surface denied:', surfaceGate.error.message)
        setUser(null)
        setUserProfile(null)
        payoutCorridorsBootstrappedForUserRef.current = null
        setLoading(false)
        return null
      }

      // Get email_confirmed_at from Supabase auth user
      const { data: { session } } = await supabase.auth.getSession()
      const emailConfirmedAt = session?.user?.email_confirmed_at || undefined
      
      // Try regular users table first
      const { data: regularUser, error: regularUserError } = await supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .single()

      if (regularUserError) {
        console.warn(
          'AuthContext: public.users query error (check RLS: users need SELECT for auth.uid() = id):',
          regularUserError.message,
          regularUserError.code ?? ''
        )
      }

      if (regularUser && !regularUserError) {
        if (__DEV__) {
          console.log('AuthContext: Regular user found:', regularUser.email)
        }
        const row = regularUser as Record<string, unknown>
        const profile = mapUsersRowToUser(row)
        setUser(profile)
        if (payoutCorridorsBootstrappedForUserRef.current !== userId) {
          payoutCorridorsBootstrappedForUserRef.current = userId
          void hydratePayoutCorridorsFromStorage().then(() => refreshPayoutCorridors())
        }

        const nextProfile: AuthUser = {
          id: regularUser.id,
          email: regularUser.email,
          isAdmin: false,
          email_confirmed_at: emailConfirmedAt,
          noah_customer_id: profile.noah_customer_id,
          noah_kyc_status: profile.noah_kyc_status,
          noah_kyc_rejection_reasons: profile.noah_kyc_rejection_reasons,
          residence_country: profile.residence_country,
          role: profile.role,
          easner_business_id: profile.easner_business_id,
          bridge_kyc_status: row.bridge_kyc_status as string | undefined,
          bridge_customer_id: row.bridge_customer_id as string | undefined,
          bridge_kyc_rejection_reasons: row.bridge_kyc_rejection_reasons,
          bridge_endorsements: row.bridge_endorsements,
          bridge_signed_agreement_id: row.bridge_signed_agreement_id as string | undefined,
          updated_at: profile.updated_at,
          profile,
          verifiedIdentity: buildVerifiedIdentityFromKycFields(row),
        }
        setUserProfile(nextProfile)
        warmAvatarCache(nextProfile.profile.avatar_url)
        void writeProfileSnapshot(nextProfile)
        return regularUser
      }

      console.log('AuthContext: No user row in public.users yet')
      // If user not found in either table, clear state
      setUser(null)
      setUserProfile(null)
      payoutCorridorsBootstrappedForUserRef.current = null
      return null
    } catch (error) {
      console.error('Error fetching user profile:', error)
      // Don't clear user state on error, just log it
      console.log('AuthContext: Profile fetch error, but keeping user session')
      return null
    } finally {
      profileFetchInFlightRef.current.delete(userId)
      lastAutoProfileFetchAtRef.current[userId] = Date.now()
      if (profileFetchPendingRef.current) {
        profileFetchPendingRef.current = false
        /** Second caller while in flight — must not be dropped by throttle. */
        void fetchUserProfile(userId, user, { ...(opts ?? {}), force: true, sourceEvent: opts?.sourceEvent })
      }
    }
  }

  const refreshUserProfile = useCallback(async () => {
    if (user?.id) {
      await fetchUserProfile(user.id, undefined, { force: true })
    }
  }, [user?.id])

  const prevMfaPendingRef = useRef(false)
  useEffect(() => {
    const wasPending = prevMfaPendingRef.current
    prevMfaPendingRef.current = Boolean(mfaPending)
    if (wasPending && !mfaPending && user?.id) {
      void fetchUserProfile(user.id, undefined, { force: true, sourceEvent: 'SIGNED_IN' })
    }
  }, [mfaPending, user?.id])

  const applyPersonalSettingsFromServer = useCallback(
    (personal: PersonalSettingsPayload, options?: { easetag?: string }) => {
      const prev = userProfileRef.current
      if (!prev?.id) return
      const nextAuth = patchAuthUserWithPersonal(prev, personal, options)
      setUser(nextAuth.profile)
      setUserProfile(nextAuth)
      warmAvatarCache(nextAuth.profile.avatar_url)
      userProfileRef.current = nextAuth
      void writeProfileSnapshot(nextAuth)
    },
    [],
  )

  const consumeOAuthCallbackIfPresent = useCallback(async (url: string) => {
    if (oauthConsumeInFlightRef.current) return
    const { code, accessToken, refreshToken, error, errorDescription } = parseAuthCallbackUrl(url)
    if (error) {
      console.warn('AuthContext: OAuth error:', error, errorDescription ?? '')
      return
    }
    if (!code && !accessToken) return
    void WebBrowser.dismissBrowser().catch(() => undefined)
    oauthConsumeInFlightRef.current = true
    try {
      if (code) {
        const { error: exErr } = await supabase.auth.exchangeCodeForSession(code)
        if (exErr) {
          console.warn('AuthContext: exchangeCodeForSession failed:', exErr.message)
        }
        return
      }
      if (accessToken) {
        const { error: sErr } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken ?? '',
        })
        if (sErr) {
          console.warn('AuthContext: setSession (OAuth fragment) failed:', sErr.message)
        }
      }
    } finally {
      oauthConsumeInFlightRef.current = false
    }
  }, [])

  useEffect(() => {
    let mounted = true

    const linkSub = Linking.addEventListener('url', (event) => {
      void consumeOAuthCallbackIfPresent(event.url)
    })

    // Get initial session
    const getInitialSession = async () => {
      let hadSessionUser = false
      try {
        const initialUrl = await Linking.getInitialURL()
        if (initialUrl) {
          await consumeOAuthCallbackIfPresent(initialUrl)
          if (isUserDeepLinkUrl(initialUrl)) {
            await stashPendingDeepLinkFromUrl(initialUrl)
          }
        }
        await clearInvalidPersistedAuthSession()
        const clearedIncompleteMfa = await clearIncompleteMfaSessionOnColdStart(supabase)
        const {
          data: { session },
        } = await supabase.auth.getSession()

        if (mounted && clearedIncompleteMfa) {
          clearSessionUserHydrated()
          setUser(null)
          setUserProfile(null)
          payoutCorridorsBootstrappedForUserRef.current = null
          setMfaPending(null)
          setMfaGateResolved(true)
          setLoading(false)
          void syncIntercomSession(null)
          return
        }

        if (mounted && session?.user) {
          hadSessionUser = true
          markSessionUserHydrated(session.user.id)
          const mappedUser = mapSessionUser(session.user)
          const existing = userProfileRef.current
          if (existing?.id === session.user.id) {
            setUser(existing.profile)
          } else {
            const snap = await hydrateSessionUserFromSnapshot(session.user.id)
            if (!mounted) return
            if (snap) {
              setUser(snap.profile)
              setUserProfile(snap)
            } else {
              setUser(mappedUser)
            }
          }
          void syncMfaGateFromSession().then((gate) => {
            if (gate === 'pending' || gate === 'missing_factor') return
            fetchUserProfile(session.user.id, mappedUser, { force: true }).catch((error) => {
              console.error('Initial profile fetch error:', error)
            })
          })
          void syncIntercomSession(session)
        }
      } catch (error) {
        console.error('Error getting initial session:', error)
      } finally {
        /**
         * Important UX invariant:
         * - If `getSession()` returns null on cold start, Supabase may still restore the session
         *   moments later via the `INITIAL_SESSION` auth event.
         * - If we set `loading=false` here in the null-session case, AppNavigator will briefly render
         *   the logged-out Auth stack, then immediately jump to PIN when the auth event arrives.
         *
         * Therefore: only end loading here when we actually saw a session user.
         * The `onAuthStateChange` listener below is the source of truth for the null-session path.
         */
        if (mounted && hadSessionUser) {
          setLoading(false)
        }
      }
    }

    getInitialSession()

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!mounted) return

      if (__DEV__) {
        console.log('AuthContext: Auth state change:', event, session?.user?.id)
      }

      /**
       * Token refresh does not change identity or `public.users` row. Running full profile sync
       * on every refresh spams the API and re-renders the tree (bad for dashboard auto-sync).
       *
       * On cold start / resume after idle, GoTrue may emit TOKEN_REFRESHED before INITIAL_SESSION.
       * Ending bootstrap (`loading=false`) before `user` is hydrated makes AppNavigator flash the
       * logged-out Auth stack, then jump to PIN when the session event arrives.
       */
      if (event === 'TOKEN_REFRESHED' && session?.user) {
        void syncIntercomSession(session)
        if (mounted && mfaHydratedUserIdRef.current === session.user.id) {
          setLoading(false)
        }
        return
      }

      try {
        if (session?.user) {
          if (event === 'INITIAL_SESSION') {
            const clearedIncompleteMfa = await clearIncompleteMfaSessionOnColdStart(supabase)
            if (clearedIncompleteMfa) {
              if (!mounted) return
              clearSessionUserHydrated()
              setUser(null)
              setUserProfile(null)
              payoutCorridorsBootstrappedForUserRef.current = null
              setMfaPending(null)
              setMfaGateResolved(true)
              setLoading(false)
              void syncIntercomSession(null)
              return
            }
          }

          if (__DEV__) {
            console.log('AuthContext: User session found, hydrating user then syncing MFA gate')
          }
          markSessionUserHydrated(session.user.id)
          const mappedUser = mapSessionUser(session.user)
          const existing = userProfileRef.current
          if (existing?.id === session.user.id) {
            setUser(existing.profile)
          } else {
            const snap = await hydrateSessionUserFromSnapshot(session.user.id)
            if (!mounted) return
            if (snap) {
              setUser(snap.profile)
              setUserProfile(snap)
            } else {
              setUser(mappedUser)
            }
          }
          const profileForce =
            event === 'SIGNED_IN' || event === 'USER_UPDATED' || event === 'PASSWORD_RECOVERY'
          void syncMfaGateFromSession().then((gate) => {
            if (gate === 'pending' || gate === 'missing_factor') return
            fetchUserProfile(session.user.id, mappedUser, {
              force: profileForce,
              sourceEvent: event,
            }).catch((error) => {
              console.error('Background profile fetch error:', error)
            })
          })
          void syncIntercomSession(session)
        } else {
          // No user session - clear state immediately
          // This happens when user logs out via signOut() or session expires
          lastAutoProfileFetchAtRef.current = {}
          clearSessionUserHydrated()
          setUser(null)
          setUserProfile(null)
          payoutCorridorsBootstrappedForUserRef.current = null
          setMfaPending(null)
          setMfaGateResolved(true)
          setLoading(false) // Ensure loading is false so AppNavigator doesn't wait
          void syncIntercomSession(null)
        }
      } catch (error) {
        console.error('Error handling auth state change:', error)
        // Don't clear state on error, just log it
      } finally {
        if (mounted) {
          /** Do not wait for `userProfile` — PIN/MFA gates only need session + MFA state. */
          setLoading(false)
        }
      }
    })

    return () => {
      mounted = false
      linkSub.remove()
      subscription.unsubscribe()
    }
  }, [consumeOAuthCallbackIfPresent, syncMfaGateFromSession, markSessionUserHydrated, clearSessionUserHydrated])

  useEffect(() => {
    if (user?.id) {
      void updateSessionActivity()
    }
  }, [user?.id])

  /** Keep profile avatar in expo-image disk cache (PIN, dashboard, More). */
  useEffect(() => {
    warmAvatarCache(userProfile?.profile?.avatar_url)
  }, [userProfile?.profile?.avatar_url])

  const signIn = async (email: string, password: string, rememberMe: boolean = false) => {
    try {
      console.log('AuthContext: Attempting sign in for:', email)
      // Don't set loading to true here to prevent loading screen during login
      
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (error) {
        console.log('AuthContext: Sign in error:', error.message)
        return { error }
      }

      console.log('AuthContext: Sign in successful, session:', !!data.session)
      if (data.user) {
        const { first_name, last_name } = mapNameFromMetadata(
          data.user.user_metadata as Record<string, unknown> | undefined,
        )
        const mappedUser: User = {
          id: data.user.id,
          email: data.user.email || email.trim(),
          full_name: [first_name, last_name].filter(Boolean).join(' ') || null,
          first_name,
          last_name,
          phone: data.user.phone ?? undefined,
          status: 'active',
          base_currency: 'USD',
          enabled_extra_account_currencies: [],
          created_at: data.user.created_at,
          updated_at: data.user.updated_at || data.user.created_at,
        }
        /** Hold PIN until MFA requirement is resolved (`mfaGateResolved`). */
        markSessionUserHydrated(mappedUser.id)
        setUser(mappedUser)
        setLoading(false)
      }

      // Track successful sign in
      analytics.trackSignIn('email', {
        rememberMe,
        userId: data.user?.id
      })
      if (data.user?.id) {
        analytics.identify(data.user.id, {
          email: data.user.email || email.trim(),
          authMethod: 'email',
        })
      }

      // Don't mark first login here - only mark after PIN is set up
      // This way, users with active sessions are treated as existing users

      // Don't update session activity here - it should only be updated after PIN verification
      // This ensures the flow is: Login → PIN Entry → Main App
      // If we update here, session becomes valid immediately and skips PIN entry

      // If remember me is checked, extend session duration
      if (rememberMe && data.session) {
        // Set a longer session duration (30 days)
        await supabase.auth.setSession({
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token,
        })
      }

      const gate = await syncMfaGateFromSession()
      if (gate === 'missing_factor') {
        return {
          error: {
            message:
              'Additional verification is required, but no authenticator was found. Contact support.',
          },
        }
      }

      // Defer surface + bootstrap checks until AAL2: `verifyMfa` runs `ensureConsumerMobileAccess` after OTP.
      if (gate !== 'pending') {
        const surfaceGate = await ensureConsumerMobileAccess()
        if (surfaceGate.error) {
          return { error: { message: surfaceGate.error.message } }
        }
      }

      return { error: null }
    } catch (error) {
      console.error('Sign in error:', error)
      return { error }
    }
  }

  const signInWithGoogle = useCallback(async (): Promise<{ error: Error | null }> => {
    try {
      const redirectTo = getOAuthRedirectUri()
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo,
          skipBrowserRedirect: true,
          // Always show Google account chooser (don’t auto-reuse the last signed-in Google session on device).
          queryParams: { prompt: 'select_account' },
        },
      })
      if (error) return { error: new Error(error.message || 'Unable to start Google sign-in.') }
      const authUrl = data?.url
      if (!authUrl) return { error: new Error('Unable to start Google sign-in.') }

      try {
        const u = new URL(authUrl)
        const redirectToInAuthUrlRaw = u.searchParams.get('redirect_to') ?? u.searchParams.get('redirectTo')
        const redirectToInAuthUrl =
          typeof redirectToInAuthUrlRaw === 'string' ? decodeURIComponent(redirectToInAuthUrlRaw) : null

        const supabaseProjectUrl =
          (Constants.expoConfig?.extra as { supabaseUrl?: string } | undefined)?.supabaseUrl || ''

        if (isProbablySupabaseSiteUrlFallbackRedirect(redirectToInAuthUrl, redirectTo)) {
          return {
            error: new Error(
              `Supabase rejected the app redirect URL and fell back to a website URL (${redirectToInAuthUrl}). Add "${redirectTo}" to Supabase Auth → URL Configuration → Redirect URLs for the SAME project as EXPO_PUBLIC_SUPABASE_URL (${supabaseProjectUrl}).`,
            ),
          }
        }

        if (redirectToInAuthUrl && redirectToInAuthUrl !== redirectTo) {
          return {
            error: new Error(
              `Supabase OAuth redirect mismatch. Expected "${redirectTo}" but got "${redirectToInAuthUrl}". Fix Supabase redirect allow-list / Site URL settings for project ${supabaseProjectUrl}.`,
            ),
          }
        }
      } catch {
        // ignore
      }

      analytics.trackSignIn('google')

      if (Platform.OS === 'web') {
        if (typeof window !== 'undefined') {
          window.location.assign(authUrl)
        }
        return { error: null }
      }

      await WebBrowser.openBrowserAsync(authUrl, {
        controlsColor: '#0F1110',
        enableBarCollapsing: true,
        showTitle: true,
      })

      return finalizePostAuthSession({
        noSessionMessage: 'Google sign-in did not create a session in the app.',
      })
    } catch (e) {
      return { error: e instanceof Error ? e : new Error('Unable to continue with Google.') }
    }
  }, [consumeOAuthCallbackIfPresent])

  const signInWithApple = useCallback(async (): Promise<{ error: Error | null }> => {
    if (Platform.OS === 'web') {
      try {
        const { idToken, fullName } = await signInWithAppleWeb()

        // Omit nonce — matches native iOS; avoids GoTrue hex vs Apple base64url mismatch.
        const { error: signInError } = await supabase.auth.signInWithIdToken({
          provider: 'apple',
          token: idToken,
        })
        if (signInError) {
          return { error: new Error(signInError.message || 'Unable to continue with Apple.') }
        }

        if (fullName) {
          await supabase.auth.updateUser({ data: { name: fullName, full_name: fullName } })
        }

        analytics.trackSignIn('apple')
        return finalizePostAuthSession({
          noSessionMessage: 'Apple sign-in did not create a session in the app.',
        })
      } catch (e) {
        if (isAppleWebSignInCanceled(e)) return { error: null }
        return { error: e instanceof Error ? e : new Error('Unable to continue with Apple.') }
      }
    }

    try {
      const available = await AppleAuthentication.isAvailableAsync()
      if (!available) {
        return { error: new Error('Sign in with Apple is not available on this device.') }
      }

      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      })

      if (!credential.identityToken) {
        return { error: new Error('Apple sign-in did not return an identity token.') }
      }

      const { error: signInError } = await supabase.auth.signInWithIdToken({
        provider: 'apple',
        token: credential.identityToken,
      })
      if (signInError) {
        return { error: new Error(signInError.message || 'Unable to continue with Apple.') }
      }

      if (credential.fullName) {
        const givenName = credential.fullName.givenName ?? ''
        const familyName = credential.fullName.familyName ?? ''
        const name = [givenName, familyName].filter(Boolean).join(' ')
        if (name) {
          await supabase.auth.updateUser({ data: { name, full_name: name } })
        }
      }

      analytics.trackSignIn('apple')
      return finalizePostAuthSession()
    } catch (e: unknown) {
      const err = e as { code?: string }
      if (err?.code === 'ERR_REQUEST_CANCELED') {
        return { error: null }
      }
      return { error: e instanceof Error ? e : new Error('Unable to continue with Apple.') }
    }
  }, [])

  const resendSignupOtp = useCallback(async (email: string): Promise<{ error: Error | null }> => {
    try {
      const addr = email.trim()
      if (!addr) return { error: new Error('Enter your email address first.') }
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email: addr,
      })
      if (error) return { error: new Error(error.message || 'Unable to resend code.') }
      return { error: null }
    } catch (e) {
      return { error: e instanceof Error ? e : new Error('Unable to resend code.') }
    }
  }, [])

  const signUp = async (email: string, password: string, name: string) => {
    try {
      const emailRedirectTo = Linking.createURL('auth/callback')
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: { name: name.trim() },
          emailRedirectTo,
        },
      })

      if (error) {
        return { error }
      }

      if (data.user?.id) {
        if (data.session) {
          const { first_name, last_name } = mapNameFromMetadata(
            data.user.user_metadata as Record<string, unknown> | undefined,
          )
          const mappedUser: User = {
            id: data.user.id,
            email: data.user.email || email.trim(),
            full_name: [first_name, last_name].filter(Boolean).join(' ') || null,
            first_name,
            last_name,
            phone: data.user.phone ?? undefined,
            status: 'active',
            base_currency: 'USD',
            enabled_extra_account_currencies: [],
            created_at: data.user.created_at,
            updated_at: data.user.updated_at || data.user.created_at,
          }
          markSessionUserHydrated(mappedUser.id)
          setUser(mappedUser)
          setLoading(false)
          void syncMfaGateFromSession()
        }
        analytics.identify(data.user.id, {
          email: data.user.email || email.trim(),
          name: name.trim(),
          authMethod: 'email',
        })
        analytics.trackSignUp('email', {
          userId: data.user.id,
          needsEmailConfirmation: !data.session,
        })
      }

      return { error: null, needsEmailConfirmation: !data.session }
    } catch (error) {
      console.error('Sign up error:', error)
      return { error }
    }
  }

  const signOut = async () => {
    const mfaCacheUserId = user?.id
    try {
      console.log('AuthContext: Signing out user')
      setMfaPending(null)
      setMfaGateResolved(true)
      clearSessionUserHydrated()

      // Track sign out
      analytics.trackSignOut()
      
      // Clear PIN auth data on logout
      await clearPinAuth()
      
      // Clear from onboarding flag so back arrow doesn't show after logout
      await AsyncStorage.removeItem('@easner_from_onboarding')

      await AsyncStorage.removeItem(AUTH_INITIAL_MODE_KEY)
      
      // Clear onboarding completion flag so user goes to onboarding screen on logout (native only)
      if (Platform.OS !== 'web') {
        await AsyncStorage.removeItem('@easner_onboarding_completed')
      }
      
      // Clear user state IMMEDIATELY and synchronously to trigger navigation
      // This must happen FIRST before anything else to ensure AppNavigator responds immediately
      setUser(null)
      setUserProfile(null)
      payoutCorridorsBootstrappedForUserRef.current = null
      setLoading(false) // Also set loading to false to ensure AppNavigator doesn't wait

      await clearJurisdictionCountryPolicyCache()

      // Sign out from Supabase (this will trigger onAuthStateChange which also sets user to null)
      // Do this AFTER setting user to null so navigation happens first
      await supabase.auth.signOut()
      console.log('AuthContext: Sign out successful')
    } catch (error) {
      console.error('Sign out error:', error)
      // Still clear the state even if sign out fails
      setUser(null)
      setUserProfile(null)
      payoutCorridorsBootstrappedForUserRef.current = null
    } finally {
      await clearMfaVerified(mfaCacheUserId ?? null)
    }
  }

  const cancelMfaSignIn = useCallback(async () => {
    await signOut()
  }, [signOut])

  const value = {
    user,
    userProfile,
    loading,
    mfaPending,
    mfaGateResolved,
    signIn,
    signInWithGoogle,
    signInWithApple,
    resendSignupOtp,
    verifySignupOtp,
    verifyMfa,
    cancelMfaSignIn,
    signUp,
    signOut,
    refreshUserProfile,
    applyPersonalSettingsFromServer,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

import React, { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react'
import * as Linking from 'expo-linking'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { supabase, clearInvalidPersistedAuthSession } from '../lib/supabase'
import { User, AuthUser } from '../types'
import type { User as SupabaseUser } from '@supabase/supabase-js'
import { analytics } from '../lib/analytics'
import { ensureBusinessAppUserBootstrap } from '../lib/apiClient'
import { clearJurisdictionCountryPolicyCache } from '../lib/jurisdictionCountryPolicy'
import { clearPinAuth, updateSessionActivity, markFirstLoginAfterVerification } from '../lib/pinAuth'
import { AUTH_INITIAL_MODE_KEY } from '../constants/auth'
import {
  getVerifiedTotpFactorId,
  resolvePostSignInMfaRequirement,
  totpFactorsFromListResponse,
} from '../lib/auth-mfa'
import { mapUsersRowToUser } from '../lib/userProfileHelpers'
import { ensureConsumerMobileAccess } from '../lib/validateAppSurface'
import { hydratePayoutCorridorsFromStorage, refreshPayoutCorridors } from '../lib/payoutCorridors'
import { readProfileSnapshot, writeProfileSnapshot } from '../lib/profileSnapshot'

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
  signIn: (email: string, password: string, rememberMe?: boolean) => Promise<{ error: any }>
  verifyMfa: (code: string) => Promise<{ error: Error | null }>
  cancelMfaSignIn: () => Promise<void>
  signUp: (
    email: string,
    password: string,
    name: string
  ) => Promise<{ error: any; needsEmailConfirmation?: boolean }>
  signOut: () => Promise<void>
  refreshUserProfile: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}

interface AuthProviderProps {
  children: ReactNode
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null)
  const [userProfile, setUserProfile] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [mfaPending, setMfaPending] = useState<{ factorId: string } | null>(null)
  const profileFetchInFlightRef = useRef<Set<string>>(new Set())
  /** When `refreshUserProfile` runs while a fetch is in flight, run one more fetch after the current one finishes. */
  const profileFetchPendingRef = useRef(false)
  /** Throttle automatic profile refetches (auth listener) for the same user; explicit `force` bypasses. */
  const lastAutoProfileFetchAtRef = useRef<Record<string, number>>({})
  const mfaGateSyncRef = useRef<Promise<'none' | 'pending' | 'missing_factor'> | null>(null)
  /** Avoid repeated payout-corridor hydration (and dev Metro re-bundling) on every profile refetch. */
  const payoutCorridorsBootstrappedForUserRef = useRef<string | null>(null)

  const syncMfaGateFromSession = useCallback(async (): Promise<'none' | 'pending' | 'missing_factor'> => {
    if (mfaGateSyncRef.current) {
      return mfaGateSyncRef.current
    }
    const run = (async (): Promise<'none' | 'pending' | 'missing_factor'> => {
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
    })()

    mfaGateSyncRef.current = run
    void run.finally(() => {
      if (mfaGateSyncRef.current === run) {
        mfaGateSyncRef.current = null
      }
    })
    return run
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
      setMfaPending(null)
      const surfaceGate = await ensureConsumerMobileAccess()
      if (surfaceGate.error) {
        return { error: surfaceGate.error }
      }
      return { error: null }
    },
    [],
  )

  const fetchUserProfile = async (
    userId: string,
    user?: any,
    opts?: { force?: boolean; sourceEvent?: string },
  ) => {
    /** Belt-and-suspenders: never pull `public.users` on token rotation (no identity change). */
    if (opts?.sourceEvent === 'TOKEN_REFRESHED') {
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

      await ensureBusinessAppUserBootstrap()

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
        const orgId =
          typeof row.easner_business_id === 'string' ? row.easner_business_id : null
        const role = row.role === 'business' || row.role === 'individual' ? row.role : profile.role
        if (orgId && role === 'business') {
          const { data: biz } = await supabase
            .from('businesses')
            .select('noah_kyb_status, noah_customer_id')
            .eq('id', orgId)
            .maybeSingle()
          if (biz) {
            if (typeof biz.noah_kyb_status === 'string' && biz.noah_kyb_status.trim()) {
              profile.noah_kyb_status = biz.noah_kyb_status
            }
            if (typeof biz.noah_customer_id === 'string' && biz.noah_customer_id.trim()) {
              profile.noah_kyb_customer_id = biz.noah_customer_id
            }
          }
        }
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
          noah_signed_agreement_id: profile.noah_signed_agreement_id,
          noah_kyb_status: profile.noah_kyb_status ?? null,
          role: profile.role,
          easner_business_id: profile.easner_business_id,
          bridge_kyc_status: row.bridge_kyc_status as string | undefined,
          bridge_customer_id: row.bridge_customer_id as string | undefined,
          bridge_kyc_rejection_reasons: row.bridge_kyc_rejection_reasons,
          bridge_endorsements: row.bridge_endorsements,
          bridge_signed_agreement_id: row.bridge_signed_agreement_id as string | undefined,
          updated_at: profile.updated_at,
          profile,
        }
        setUserProfile(nextProfile)
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

  useEffect(() => {
    let mounted = true

    // Get initial session
    const getInitialSession = async () => {
      try {
        await clearInvalidPersistedAuthSession()
        const {
          data: { session },
        } = await supabase.auth.getSession()

        if (mounted && session?.user) {
          /** Resolve MFA gate before `setUser` so navigation order is always Login → MFA → PIN → app. */
          await syncMfaGateFromSession()
          const {
            data: { session: afterGate },
          } = await supabase.auth.getSession()
          if (!mounted || !afterGate?.user) return

          const { first_name, last_name } = mapNameFromMetadata(afterGate.user.user_metadata)
          const mappedUser: User = {
            id: afterGate.user.id,
            email: afterGate.user.email || '',
            full_name: [first_name, last_name].filter(Boolean).join(' ') || null,
            first_name,
            last_name,
            phone: afterGate.user.phone ?? undefined,
            status: 'active',
            base_currency: 'USD',
            enabled_extra_account_currencies: [],
            created_at: afterGate.user.created_at,
            updated_at: afterGate.user.updated_at || afterGate.user.created_at,
          }
          setUser(mappedUser)
          const snap = await readProfileSnapshot(afterGate.user.id)
          if (snap?.id === afterGate.user.id) {
            setUser(snap.profile)
            setUserProfile(snap)
          }
          fetchUserProfile(afterGate.user.id, mappedUser, { force: true }).catch(error => {
            console.error('Initial profile fetch error:', error)
          })
        }
      } catch (error) {
        console.error('Error getting initial session:', error)
      } finally {
        if (mounted) {
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
       */
      if (event === 'TOKEN_REFRESHED' && session?.user) {
        if (mounted) setLoading(false)
        return
      }

      try {
        if (session?.user) {
          if (__DEV__) {
            console.log('AuthContext: User session found, resolving MFA gate then profile')
          }
          await syncMfaGateFromSession()
          const {
            data: { session: afterGate },
          } = await supabase.auth.getSession()
          if (!mounted || !afterGate?.user) return

          const { first_name, last_name } = mapNameFromMetadata(afterGate.user.user_metadata)
          const mappedUser: User = {
            id: afterGate.user.id,
            email: afterGate.user.email || '',
            full_name: [first_name, last_name].filter(Boolean).join(' ') || null,
            first_name,
            last_name,
            phone: afterGate.user.phone ?? undefined,
            status: 'active',
            base_currency: 'USD',
            enabled_extra_account_currencies: [],
            created_at: afterGate.user.created_at,
            updated_at: afterGate.user.updated_at || afterGate.user.created_at,
          }
          setUser(mappedUser)
          const snap = await readProfileSnapshot(afterGate.user.id)
          if (snap?.id === afterGate.user.id) {
            setUser(snap.profile)
            setUserProfile(snap)
          }
          const profileForce =
            event === 'SIGNED_IN' || event === 'USER_UPDATED' || event === 'PASSWORD_RECOVERY'
          fetchUserProfile(afterGate.user.id, mappedUser, {
            force: profileForce,
            sourceEvent: event,
          }).catch((error) => {
            console.error('Background profile fetch error:', error)
          })
        } else {
          // No user session - clear state immediately
          // This happens when user logs out via signOut() or session expires
          lastAutoProfileFetchAtRef.current = {}
          setUser(null)
          setUserProfile(null)
          payoutCorridorsBootstrappedForUserRef.current = null
          setMfaPending(null)
          setLoading(false) // Ensure loading is false so AppNavigator doesn't wait
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
      subscription.unsubscribe()
    }
  }, [syncMfaGateFromSession])

  useEffect(() => {
    if (user?.id) {
      void updateSessionActivity()
    }
  }, [user?.id])

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
    try {
      console.log('AuthContext: Signing out user')
      setMfaPending(null)

      // Track sign out
      analytics.trackSignOut()
      
      // Clear PIN auth data on logout
      await clearPinAuth()
      
      // Clear from onboarding flag so back arrow doesn't show after logout
      await AsyncStorage.removeItem('@easner_from_onboarding')

      await AsyncStorage.removeItem(AUTH_INITIAL_MODE_KEY)
      
      // Clear onboarding completion flag so user goes to onboarding screen on logout
      await AsyncStorage.removeItem('@easner_onboarding_completed')
      
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
    signIn,
    verifyMfa,
    cancelMfaSignIn,
    signUp,
    signOut,
    refreshUserProfile,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}




import React, { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react'
import * as Linking from 'expo-linking'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { supabase } from '../lib/supabase'
import { User, AuthUser } from '../types'
import type { User as SupabaseUser } from '@supabase/supabase-js'
import { analytics } from '../lib/analytics'
import { ensureBusinessAppUserBootstrap } from '../lib/apiClient'
import { clearJurisdictionCountryPolicyCache } from '../lib/jurisdictionCountryPolicy'
import { clearPinAuth, updateSessionActivity, markFirstLoginAfterVerification } from '../lib/pinAuth'
import { AUTH_INITIAL_MODE_KEY } from '../constants/auth'
import {
  getVerifiedTotpFactorId,
  isMfaStepRequired,
  totpFactorsFromListResponse,
} from '../lib/auth-mfa'
import { mapUsersRowToUser } from '../lib/userProfileHelpers'

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

  const syncMfaGateFromSession = useCallback(async (): Promise<'none' | 'pending' | 'missing_factor'> => {
    const { data: aal, error: aalErr } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
    if (aalErr) {
      console.warn('AuthContext: MFA AAL error', aalErr.message)
      setMfaPending(null)
      return 'none'
    }
    if (!isMfaStepRequired(aal)) {
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
      setMfaPending(null)
      setLoading(false)
      return 'missing_factor'
    }
    setMfaPending({ factorId: fid })
    return 'pending'
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
      const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
      if (!isMfaStepRequired(aal)) {
        setMfaPending(null)
        return { error: null }
      }
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
      return { error: null }
    },
    [],
  )

  const fetchUserProfile = async (userId: string, user?: any) => {
    if (profileFetchInFlightRef.current.has(userId)) {
      return null
    }
    profileFetchInFlightRef.current.add(userId)

    try {
      console.log('AuthContext: Fetching user profile for userId:', userId)

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
        console.log('AuthContext: Regular user found:', regularUser.email)
        const row = regularUser as Record<string, unknown>
        const profile = mapUsersRowToUser(row)
        setUser(profile)
        void import('../lib/payoutCorridors').then((m) => {
          void m.hydratePayoutCorridorsFromStorage().then(() => m.refreshPayoutCorridors())
        })

        setUserProfile({
          id: regularUser.id,
          email: regularUser.email,
          isAdmin: false,
          email_confirmed_at: emailConfirmedAt,
          noah_customer_id: profile.noah_customer_id,
          noah_kyc_status: profile.noah_kyc_status,
          noah_kyc_rejection_reasons: profile.noah_kyc_rejection_reasons,
          noah_signed_agreement_id: profile.noah_signed_agreement_id,
          noah_kyb_status: profile.noah_kyb_status,
          easner_role: profile.easner_role,
          easner_business_id: profile.easner_business_id,
          bridge_kyc_status: row.bridge_kyc_status as string | undefined,
          bridge_customer_id: row.bridge_customer_id as string | undefined,
          bridge_kyc_rejection_reasons: row.bridge_kyc_rejection_reasons,
          bridge_endorsements: row.bridge_endorsements,
          bridge_signed_agreement_id: row.bridge_signed_agreement_id as string | undefined,
          updated_at: profile.updated_at,
          profile,
        })
        return regularUser
      }

      // Check admin_users table
      const { data: adminUser, error: adminError } = await supabase
        .from('admin_users')
        .select('*')
        .eq('id', userId)
        .single()

      if (adminUser && !adminError) {
        // Admin users cannot access mobile app - sign them out
        console.log('Admin user detected, signing out from mobile app')
        await supabase.auth.signOut()
        setUser(null)
        setUserProfile(null)
        return null
      }

      console.log('AuthContext: No user found in either table')
      // If user not found in either table, clear state
      setUser(null)
      setUserProfile(null)
      return null
    } catch (error) {
      console.error('Error fetching user profile:', error)
      // Don't clear user state on error, just log it
      console.log('AuthContext: Profile fetch error, but keeping user session')
      return null
    } finally {
      profileFetchInFlightRef.current.delete(userId)
    }
  }

  const refreshUserProfile = useCallback(async () => {
    if (user?.id) {
      await fetchUserProfile(user.id)
    }
  }, [user?.id])

  useEffect(() => {
    let mounted = true

    // Get initial session
    const getInitialSession = async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession()

        if (mounted && session?.user) {
          const { first_name, last_name } = mapNameFromMetadata(session.user.user_metadata)
          const mappedUser: User = {
            id: session.user.id,
            email: session.user.email || '',
            full_name: [first_name, last_name].filter(Boolean).join(' ') || null,
            first_name,
            last_name,
            phone: session.user.phone ?? undefined,
            status: 'active',
            base_currency: 'USD',
            enabled_extra_account_currencies: [],
            created_at: session.user.created_at,
            updated_at: session.user.updated_at || session.user.created_at,
          }
          setUser(mappedUser)
          void syncMfaGateFromSession()
          // Fetch profile in background
          fetchUserProfile(session.user.id, mappedUser).catch(error => {
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

      console.log('AuthContext: Auth state change:', event, session?.user?.id)

      try {
        if (session?.user) {
          console.log('AuthContext: User session found, fetching profile')
          const { first_name, last_name } = mapNameFromMetadata(session.user.user_metadata)
          const mappedUser: User = {
            id: session.user.id,
            email: session.user.email || '',
            full_name: [first_name, last_name].filter(Boolean).join(' ') || null,
            first_name,
            last_name,
            phone: session.user.phone ?? undefined,
            status: 'active',
            base_currency: 'USD',
            enabled_extra_account_currencies: [],
            created_at: session.user.created_at,
            updated_at: session.user.updated_at || session.user.created_at,
          }
          setUser(mappedUser)
          void syncMfaGateFromSession()
          // Fetch profile in background
          fetchUserProfile(session.user.id, mappedUser).catch(error => {
            console.error('Background profile fetch error:', error)
          })
        } else {
          // No user session - clear state immediately
          // This happens when user logs out via signOut() or session expires
          setUser(null)
          setUserProfile(null)
          setMfaPending(null)
          setLoading(false) // Ensure loading is false so AppNavigator doesn't wait
        }
      } catch (error) {
        console.error('Error handling auth state change:', error)
        // Don't clear state on error, just log it
      } finally {
        if (mounted) {
          // Set loading to false when there's no session (user logged out)
          // This ensures AppNavigator doesn't wait for loading state
          if (!session?.user) {
            setLoading(false)
          } else if (userProfile) {
            // User is logged in and profile is loaded
            setLoading(false)
          }
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

      // The auth state change handler will manage the loading state
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
      setLoading(false) // Also set loading to false to ensure AppNavigator doesn't wait

      clearJurisdictionCountryPolicyCache()

      // Sign out from Supabase (this will trigger onAuthStateChange which also sets user to null)
      // Do this AFTER setting user to null so navigation happens first
      await supabase.auth.signOut()
      console.log('AuthContext: Sign out successful')
    } catch (error) {
      console.error('Sign out error:', error)
      // Still clear the state even if sign out fails
      setUser(null)
      setUserProfile(null)
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




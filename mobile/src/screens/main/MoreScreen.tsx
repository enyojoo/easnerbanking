import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useFocusEffect } from '@react-navigation/native'
import { View, Text, StyleSheet, ScrollView, Pressable, Platform } from 'react-native'
import { haptics } from '../../lib/haptics'
import type { LucideIcon } from 'lucide-react-native'
import {
  Bell,
  Banknote,
  Check,
  ChevronRight,
  Copy,
  FileText,
  HelpCircle,
  Key,
  Lock,
  LogOut,
  Shield,
  ShieldCheck,
  Users,
} from 'lucide-react-native'
import { LinearGradient } from 'expo-linear-gradient'
import ScreenWrapper from '../../components/ScreenWrapper'
import { useAuth } from '../../contexts/AuthContext'
import { NavigationProps, KYCSubmission } from '../../types'
import { kycService } from '../../lib/kycService'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { colors, textStyles, borderRadius, spacing, fontFamily, userAvatarStyles } from '../../theme'
import { useThemeColors } from '../../contexts/ThemePaletteContext'
import { ripple } from '../../lib/androidRipple'
import { EasnerAlertSheet } from '../../components/premium'
import { SettingsRow } from '../../components/SettingsRow'
import { SectionCard } from '../../components/ui'
import { initialsFromFullName } from '../../lib/userProfileHelpers'
import { AvatarImage } from '../../components/AvatarImage'
import { avatarImageUri, warmAvatarCache } from '../../lib/avatarCache'
import { useToast } from '../../components/ToastProvider'
import { useCopyToClipboard } from '../../hooks/useCopyToClipboard'
import { supabase } from '../../lib/supabase'
import {
  getVerifiedTotpFactorId,
  listFactorsForMfaStatus,
  totpFactorsFromListResponse,
  unenrollUnverifiedTotpFactors,
} from '../../lib/auth-mfa'
import {
  getMfaRefreshGeneration,
  loadMfaVerifiedPersisted,
  peekMfaVerified,
  saveMfaVerified,
  shouldListFactorsForMfaRow,
} from '../../lib/mfaStatusCache'
import { isTier1Complete, TIER2_COMPLETE_PLACEHOLDER, TIER3_COMPLETE_PLACEHOLDER } from '../../lib/compliance'
import { VERIFICATION_STATUS_COPY } from '@easner/shared'
import { useScrollBottomPadding } from '../../hooks/useScrollBottomPadding'
import { apiFetch } from '../../query/api-client'
import { useScope } from '../../query/scope'
import { useQueryClient } from '@tanstack/react-query'
import { prefetchPayrollConnections } from '../../features/payroll/queries'
import {
  loadPayrollActivityVisible,
  markPayrollActivityVisible,
  peekPayrollActivityVisible,
} from '../../lib/payrollActivityVisibility'

type TierBadge = { label: string; tone: 'green' | 'yellow' }

function tierBadgeForProfile(
  userProfile: Parameters<typeof isTier1Complete>[0],
  verificationStatus: 'approved' | 'in_review' | 'take_action',
): TierBadge {
  const tier1 = isTier1Complete(userProfile)
  const tier2 = TIER2_COMPLETE_PLACEHOLDER
  const tier3 = TIER3_COMPLETE_PLACEHOLDER
  if (tier1 || tier2 || tier3) {
    return { label: VERIFICATION_STATUS_COPY.verified, tone: 'green' }
  }
  if (verificationStatus === 'in_review') {
    return { label: VERIFICATION_STATUS_COPY.inReview, tone: 'yellow' }
  }
  if (verificationStatus === 'take_action') {
    return { label: VERIFICATION_STATUS_COPY.actionNeeded, tone: 'yellow' }
  }
  return { label: VERIFICATION_STATUS_COPY.unverified, tone: 'yellow' }
}

function MoreContent({ navigation }: NavigationProps) {
  const scrollBottomPadding = useScrollBottomPadding(spacing[2], {
    tabScreen: true,
  })
  const { user, userProfile, refreshUserProfile, signOut, loading: authLoading } = useAuth()
  const { showError } = useToast()
  const copyToClipboard = useCopyToClipboard()
  const palette = useThemeColors()
  const queryClient = useQueryClient()
  const { scope } = useScope()

  /** Main stack screens (Profile, Notifications, …) are siblings of `MainTabs`. Prefer parent `navigate` so taps work from the More tab. */
  const navigateFromMoreTab = useCallback(
    (routeName: string, params?: Record<string, unknown>) => {
      const parent = navigation.getParent?.()
      if (parent?.navigate) {
        if (params && Object.keys(params).length > 0) {
          parent.navigate(routeName as never, params as never)
        } else {
          parent.navigate(routeName as never)
        }
      } else {
        if (params && Object.keys(params).length > 0) {
          navigation.navigate(routeName as never, params as never)
        } else {
          navigation.navigate(routeName as never)
        }
      }
    },
    [navigation],
  )
  const [kycSubmissions, setKycSubmissions] = useState<KYCSubmission[]>([])
  const [showLogoutDialog, setShowLogoutDialog] = useState(false)
  const [isLoggingOut, setIsLoggingOut] = useState(false)
  const [mfaStatusLine, setMfaStatusLine] = useState('')
  /** False until MFA status is read from cache or `listFactors` — avoids showing the MFA banner while loading or on errors. */
  const [mfaStatusResolved, setMfaStatusResolved] = useState(false)
  const [pendingPayrollCount, setPendingPayrollCount] = useState(0)
  const [payrollActivityVisible, setPayrollActivityVisible] = useState(() =>
    Boolean(user?.id && peekPayrollActivityVisible(user.id)),
  )
  const lastKycProfileRefreshRef = useRef(0)
  /** Latest profile for focus handler — avoids putting `noah_kyc_status` in `useFocusEffect` deps (would re-run MFA listFactors on every profile poll while More stays focused). */
  const userProfileRef = useRef(userProfile)
  userProfileRef.current = userProfile

  useEffect(() => {
    if (!user?.id) {
      setMfaStatusLine('')
      setMfaStatusResolved(false)
    }
  }, [user?.id])

  useEffect(() => {
    let active = true
    const userId = user?.id

    setPendingPayrollCount(0)
    if (!userId) {
      setPayrollActivityVisible(false)
      return () => {
        active = false
      }
    }

    const visibleInMemory = peekPayrollActivityVisible(userId)
    setPayrollActivityVisible(visibleInMemory)
    if (visibleInMemory) {
      void prefetchPayrollConnections(queryClient, userId)
    } else {
      void loadPayrollActivityVisible(userId).then((visible) => {
        if (!active) return
        if (visible) {
          setPayrollActivityVisible(true)
          void prefetchPayrollConnections(queryClient, userId)
        }
      })
    }

    return () => {
      active = false
    }
  }, [user?.id, queryClient])

  const refreshMfaStatus = useCallback(async () => {
    const genAtStart = getMfaRefreshGeneration()
    const {
      data: { session },
    } = await supabase.auth.getSession()
    if (getMfaRefreshGeneration() !== genAtStart) return
    if (!session?.user) {
      setMfaStatusLine('')
      setMfaStatusResolved(false)
      return
    }
    const uid = session.user.id

    let cached: boolean | null = peekMfaVerified(uid)
    if (cached === null) {
      cached = await loadMfaVerifiedPersisted(uid)
    }
    if (getMfaRefreshGeneration() !== genAtStart) return

    if (cached === true && !shouldListFactorsForMfaRow(uid)) {
      setMfaStatusLine('On')
      setMfaStatusResolved(true)
      return
    }

    if (cached !== null) {
      // Show the cached state (and its banner) immediately; the listFactors call
      // below refines it. Gating `resolved` on the network made the banner appear
      // late on every focus for returning users.
      setMfaStatusLine(cached ? 'On' : 'Off')
      setMfaStatusResolved(true)
    }

    const { data, error } = await listFactorsForMfaStatus(supabase)
    if (getMfaRefreshGeneration() !== genAtStart) return

    if (error) {
      console.warn('MoreScreen MFA status:', error.message)
      if (cached !== null) {
        setMfaStatusResolved(true)
      }
      return
    }
    const totp = totpFactorsFromListResponse(data)
    const id = getVerifiedTotpFactorId(totp)
    if (!id && totp.some((f) => f.status === 'unverified')) {
      await unenrollUnverifiedTotpFactors(supabase)
    }
    if (getMfaRefreshGeneration() !== genAtStart) return

    const on = Boolean(id)
    setMfaStatusLine(on ? 'On' : 'Off')
    setMfaStatusResolved(true)
    await saveMfaVerified(uid, on)
  }, [])

  useFocusEffect(
    useCallback(() => {
      if (!user?.id) return
      let active = true
      const userId = user.id
      const mem = peekMfaVerified(user.id)
      if (mem === true) {
        setMfaStatusLine('On')
        setMfaStatusResolved(true)
      }
      const up = userProfileRef.current
      const noahKycStatus =
        up?.noah_kyc_status ?? (up as { profile?: { noah_kyc_status?: string } })?.profile?.noah_kyc_status
      if (noahKycStatus !== 'approved') {
        const now = Date.now()
        if (now - lastKycProfileRefreshRef.current > 60_000) {
          lastKycProfileRefreshRef.current = now
          void refreshUserProfile()
        }
      }
      void refreshMfaStatus()
      void apiFetch<{ pendingCount?: number; hasActivity?: boolean }>('/api/payroll/connections?summary=true')
        .then((result) => {
          if (!active) return
          setPendingPayrollCount(Number(result.pendingCount ?? 0))
          if (result.hasActivity === true) {
            setPayrollActivityVisible(true)
            void markPayrollActivityVisible(userId)
            // Warm the full connections list so More → Payroll opens from cache
            // instead of a long skeleton (same pattern as Recipients/Transactions).
            void prefetchPayrollConnections(queryClient, userId)
          }
        })
        .catch(() => undefined)

      return () => {
        active = false
      }
    }, [user?.id, refreshUserProfile, refreshMfaStatus, queryClient]),
  )

  // Refresh KYC submissions when screen comes into focus
  useEffect(() => {
    if (Platform.OS === 'web' || !userProfile?.id) return

    const fetchSubmissions = async () => {
      try {
        const submissions = await kycService.getByUserId(userProfile.id)
        setKycSubmissions(submissions || [])

        const CACHE_KEY = `easner_kyc_submissions_${userProfile.id}`
        await AsyncStorage.setItem(
          CACHE_KEY,
          JSON.stringify({
            value: submissions || [],
            timestamp: Date.now(),
          }),
        )
      } catch (error) {
        console.error('Error fetching submissions:', error)
      }
    }

    const loadKycSubmissions = async () => {
      try {
        const CACHE_KEY = `easner_kyc_submissions_${userProfile.id}`
        const cached = await AsyncStorage.getItem(CACHE_KEY)

        if (cached) {
          const { value, timestamp } = JSON.parse(cached)
          if (Date.now() - timestamp < 5 * 60 * 1000) {
            setKycSubmissions(value || [])
            // Always fetch fresh data in background
            fetchSubmissions()
            return
          }
        }

        await fetchSubmissions()
      } catch (error) {
        console.error('Error loading KYC submissions:', error)
      }
    }

    loadKycSubmissions()

    // Set up focus listener to refresh when screen comes into focus
    const unsubscribe = navigation.addListener('focus', () => {
      fetchSubmissions()
    })

    return unsubscribe
  }, [userProfile?.id, navigation])

  const getVerificationStatus = (): 'approved' | 'in_review' | 'take_action' => {
    const noahStatus =
      userProfile?.noah_kyc_status ??
      (userProfile as { profile?: { noah_kyc_status?: string } })?.profile?.noah_kyc_status

    if (noahStatus === 'approved') {
      return 'approved'
    }

    if (noahStatus === 'pending' || noahStatus === 'in_review' || noahStatus === 'under_review') {
      return 'in_review'
    }

    return 'take_action'
  }

  const verificationStatus = getVerificationStatus()
  const tierBadge = tierBadgeForProfile(userProfile, verificationStatus)

  const handleSignOut = async () => {
    setIsLoggingOut(true)
    try {
      await signOut()
    } catch (error) {
      console.error('Error signing out:', error)
      showError('Failed to sign out')
    } finally {
      setIsLoggingOut(false)
      setShowLogoutDialog(false)
    }
  }

  const handleMfaRowPress = () => {
    if (!user?.id) return
    navigateFromMoreTab('MfaSetup', {
      autoStartEnroll: mfaStatusLine !== 'On',
      mfaVerifiedOnCard: mfaStatusLine === 'On',
    })
  }

  const renderMenuItem = (
    title: string,
    subtitle: string,
    onPress: () => void,
    IconComponent: LucideIcon,
    rightComponent?: React.ReactNode,
    isDestructive: boolean = false,
    isLast: boolean = false,
  ) => (
    <SettingsRow
      title={title}
      subtitle={subtitle}
      onPress={onPress}
      icon={IconComponent}
      rightComponent={rightComponent}
      isDestructive={isDestructive}
      isLast={isLast}
    />
  )

  // Profile card data
  const fullName =
    userProfile?.profile?.full_name ||
    [userProfile?.profile?.first_name, userProfile?.profile?.last_name].filter(Boolean).join(' ') ||
    user?.full_name ||
    [user?.first_name, user?.last_name].filter(Boolean).join(' ') ||
    'Your account'
  const [easetagJustCopied, setEasetagJustCopied] = useState(false)
  const easetagCopyResetRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (easetagCopyResetRef.current) clearTimeout(easetagCopyResetRef.current)
    }
  }, [])
  const easetagRaw = (userProfile?.profile?.easetag ?? '').trim().toLowerCase()
  const profileEmail = (userProfile?.profile?.email ?? user?.email ?? '').trim()

  const handleEasetagCopy = useCallback(
    async (e?: { stopPropagation?: () => void }) => {
      e?.stopPropagation?.()
      if (!easetagRaw) return
      const text = `@${easetagRaw}`
      const ok = await copyToClipboard(text)
      if (!ok) return
      haptics.success()
      if (easetagCopyResetRef.current) clearTimeout(easetagCopyResetRef.current)
      setEasetagJustCopied(true)
      easetagCopyResetRef.current = setTimeout(() => {
        setEasetagJustCopied(false)
        easetagCopyResetRef.current = null
      }, 2000)
    },
    [copyToClipboard, easetagRaw],
  )

  const headerAvatarUri = avatarImageUri(userProfile?.profile?.avatar_url)
  useEffect(() => {
    warmAvatarCache(headerAvatarUri)
  }, [headerAvatarUri])

  // Conditional gradient banner — verify identity OR set up MFA when applicable.
  const profileReady = !authLoading && userProfile != null
  const tier1Complete = isTier1Complete(userProfile)
  const showVerifyBanner = profileReady && !tier1Complete && verificationStatus !== 'in_review'
  const showMfaBanner = profileReady && !showVerifyBanner && mfaStatusResolved && mfaStatusLine === 'Off'
  const banner = showVerifyBanner
    ? {
        title: 'Verify your identity',
        subtitle: 'Higher limits, full banking access',
        cta: 'Begin',
        Icon: ShieldCheck,
        onPress: () => navigateFromMoreTab('AccountVerification'),
      }
    : showMfaBanner
      ? {
          title: 'Turn on two-factor auth',
          subtitle: 'Extra protection for sign in',
          cta: 'Enable',
          Icon: Shield,
          onPress: handleMfaRowPress,
        }
      : null

  return (
    <ScreenWrapper>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>More</Text>
        </View>

        <ScrollView
          style={styles.scrollContainer}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: scrollBottomPadding }]}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.content}>
            {/* Profile card */}
            <SectionCard style={styles.profileCard}>
              <Pressable
                android_ripple={ripple.neutral}
                onPress={async () => {
                  haptics.tap()
                  navigateFromMoreTab('Profile')
                }}
                style={styles.profileRow}
                accessibilityRole="button"
                accessibilityLabel="Open your profile"
              >
                <View style={styles.profileAvatar}>
                  {headerAvatarUri ? (
                    <AvatarImage avatarUrl={userProfile?.profile?.avatar_url} style={userAvatarStyles.image} />
                  ) : (
                    <Text style={userAvatarStyles.initials}>{initialsFromFullName(fullName)}</Text>
                  )}
                </View>
                <View style={styles.profileInfo}>
                  <Text style={styles.profileName} numberOfLines={1}>
                    {fullName}
                  </Text>
                  <View style={styles.profileMetaLine}>
                    {easetagRaw ? (
                      <View style={styles.profileSubtitleRow}>
                        <Text style={[styles.profileSubtitlePrimary, styles.profileMetaTextShrink]} numberOfLines={1}>
                          {`Easetag: @${easetagRaw}`}
                        </Text>
                        <Pressable
                          android_ripple={ripple.neutral}
                          accessibilityRole="button"
                          accessibilityLabel={easetagJustCopied ? 'Copied' : 'Copy Easetag'}
                          hitSlop={{ top: 4, bottom: 4, left: 2, right: 2 }}
                          onPress={(ev) => void handleEasetagCopy(ev)}
                          style={[styles.profileCopyIconBtn, styles.profileCopyLeadingGap]}
                        >
                          {easetagJustCopied ? (
                            <Check size={11} color={colors.primary.main} strokeWidth={2.5} />
                          ) : (
                            <Copy size={11} color={colors.primary.main} strokeWidth={2} />
                          )}
                        </Pressable>
                      </View>
                    ) : (
                      <Text style={[styles.profileSubtitlePrimary, styles.profileMetaTextFull]} numberOfLines={1}>
                        {profileEmail}
                      </Text>
                    )}
                  </View>
                </View>
                <View style={styles.openPill}>
                  <Text style={styles.openPillText}>Open</Text>
                </View>
              </Pressable>
            </SectionCard>

            {/* Conditional gradient banner */}
            {banner ? (
              <Pressable
                android_ripple={ripple.heroOnDark}
                onPress={async () => {
                  haptics.tap()
                  banner.onPress()
                }}
                accessibilityRole="button"
                accessibilityLabel={`${banner.title}. ${banner.cta}.`}
              >
                <LinearGradient
                  colors={palette.primary.heroGradient as unknown as readonly [string, string]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.promoBanner}
                >
                  <View style={styles.promoIconWrap}>
                    <banner.Icon size={20} color="#FFFFFF" strokeWidth={2.25} />
                  </View>
                  <View style={styles.promoTextWrap}>
                    <Text style={styles.promoTitle}>{banner.title}</Text>
                    <Text style={styles.promoSubtitle}>{banner.subtitle}</Text>
                  </View>
                  <View style={styles.promoCta}>
                    <Text style={styles.promoCtaText}>{banner.cta}</Text>
                  </View>
                </LinearGradient>
              </Pressable>
            ) : null}

            {/* Account Section */}
            <View style={styles.sectionGroup}>
              <Text style={styles.sectionLabel}>ACCOUNT</Text>
              <SectionCard style={styles.sectionCard} flush>
                <Pressable
                  android_ripple={ripple.neutral}
                  style={[styles.menuItem, styles.menuItemDivider]}
                  onPress={async () => {
                    haptics.tap()
                    navigateFromMoreTab('AccountVerification')
                  }}
                >
                  <View style={styles.menuItemLeft}>
                    <View style={styles.menuItemIconWrap}>
                      <ShieldCheck size={18} color={colors.primary.main} strokeWidth={2} />
                    </View>
                    <View style={styles.menuItemTextWrap}>
                      <Text style={styles.menuItemText}>Account verification</Text>
                      <Text style={styles.menuItemSubtitle}>Verify and check status</Text>
                    </View>
                  </View>
                  <View style={styles.menuItemRight}>
                    {tierBadge.tone === 'green' ? (
                      <View style={styles.badgeGreen}>
                        <Text style={styles.badgeTextGreen}>{tierBadge.label}</Text>
                      </View>
                    ) : (
                      <View style={styles.badgeYellow}>
                        <Text style={styles.badgeTextYellow}>{tierBadge.label}</Text>
                      </View>
                    )}
                    <ChevronRight size={18} color={colors.text.tertiary} strokeWidth={2} />
                  </View>
                </Pressable>
                {renderMenuItem(
                  'Notifications',
                  'Alerts, pushes, and communication settings',
                  () => navigateFromMoreTab('Notifications'),
                  Bell,
                  undefined,
                  false,
                  false,
                )}
                {payrollActivityVisible
                  ? renderMenuItem(
                      'Payroll Connections',
                      'Companies, receiving methods, and pay stubs',
                      () => {
                        void prefetchPayrollConnections(queryClient, scope?.userId ?? user?.id)
                        navigateFromMoreTab('PayrollConnections')
                      },
                      Banknote,
                      pendingPayrollCount > 0 ? (
                        <View style={styles.badgeYellow}>
                          <Text style={styles.badgeTextYellow}>{pendingPayrollCount}</Text>
                        </View>
                      ) : undefined,
                      false,
                      false,
                    )
                  : null}
                {renderMenuItem(
                  'Recipients',
                  'Saved people and payout destinations',
                  () => navigateFromMoreTab('Recipients'),
                  Users,
                  undefined,
                  false,
                  true,
                )}
              </SectionCard>
            </View>

            {/* Security */}
            <View style={styles.sectionGroup}>
              <Text style={styles.sectionLabel}>SECURITY</Text>
              <SectionCard style={styles.sectionCard} flush>
                {renderMenuItem(
                  'Change PIN',
                  'Update your app unlock PIN',
                  () => navigateFromMoreTab('ChangePin'),
                  Key,
                  undefined,
                  false,
                  false,
                )}
                {renderMenuItem(
                  'Change password',
                  'Reset your login password securely',
                  () => navigateFromMoreTab('ChangePassword'),
                  Lock,
                  undefined,
                  false,
                  false,
                )}
                {renderMenuItem(
                  'Two-Factor Authentication',
                  'Manage authenticator app protection',
                  handleMfaRowPress,
                  Shield,
                  <View style={mfaStatusLine === 'On' ? styles.badgeGreen : styles.badgeMuted}>
                    <Text style={mfaStatusLine === 'On' ? styles.badgeTextGreen : styles.badgeTextMuted}>
                      {mfaStatusLine === 'On' ? 'On' : 'Off'}
                    </Text>
                  </View>,
                  false,
                  true,
                )}
              </SectionCard>
            </View>

            {/* App Section */}
            <View style={styles.sectionGroup}>
              <Text style={styles.sectionLabel}>APP</Text>
              <SectionCard style={styles.sectionCard} flush>
                {renderMenuItem(
                  'Support',
                  'Get help and contact our team',
                  () => navigateFromMoreTab('Support'),
                  HelpCircle,
                  undefined,
                  false,
                  false,
                )}
                {renderMenuItem(
                  'Legal',
                  'Privacy policy and terms of service',
                  () => navigateFromMoreTab('Legal'),
                  FileText,
                  undefined,
                  false,
                  true,
                )}
              </SectionCard>
            </View>

            {/* Sign Out Button */}
            <View style={styles.signOutContainer}>
              <Pressable
                android_ripple={ripple.destructiveTint}
                style={styles.signOutButton}
                onPress={async () => {
                  haptics.tap()
                  setShowLogoutDialog(true)
                }}
              >
                <LogOut size={18} color={colors.error.main} strokeWidth={2.25} />
                <Text style={styles.signOutText}>Sign out</Text>
              </Pressable>
            </View>

            {/* App Version */}
            <View style={styles.versionContainer}>
              <Text style={styles.versionText}>Easner · v1.0.0</Text>
            </View>
          </View>
        </ScrollView>
      </View>

      <EasnerAlertSheet
        visible={showLogoutDialog}
        onDismiss={() => setShowLogoutDialog(false)}
        title="Logout"
        message="Are you sure you want to logout? You'll need to sign in again to access your account."
        primaryLabel="Logout"
        onPrimary={handleSignOut}
        secondaryLabel="Cancel"
        onSecondary={() => setShowLogoutDialog(false)}
        primaryLoading={isLoggingOut}
      />
    </ScreenWrapper>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.semantic.background,
  },
  scrollContainer: {
    flex: 1,
  },
  scrollContent: {},
  header: {
    paddingHorizontal: spacing[5],
    paddingTop: spacing[4],
    paddingBottom: spacing[2],
  },
  title: {
    ...textStyles.headlineLarge,
    color: colors.text.primary,
    fontFamily: fontFamily.semibold,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  content: {
    paddingHorizontal: spacing[5],
    paddingTop: spacing[2],
    gap: spacing[4],
  },
  /** Profile card (white SectionCard) at the top. */
  profileCard: {
    paddingVertical: spacing[4],
    paddingHorizontal: spacing[4],
  },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
  },
  profileAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    overflow: 'hidden',
    backgroundColor: colors.semantic.muted,
    justifyContent: 'center',
    alignItems: 'center',
  },
  profileInfo: {
    flex: 1,
    minWidth: 0,
    gap: 0,
    justifyContent: 'center',
  },
  profileName: {
    ...textStyles.bodyLarge,
    color: colors.text.primary,
    fontFamily: fontFamily.semibold,
    fontWeight: '600',
  },
  profileMetaLine: {
    marginTop: 0,
    maxWidth: '100%',
    alignSelf: 'stretch',
  },
  profileSubtitlePrimary: {
    ...textStyles.bodySmall,
    color: colors.primary.main,
    fontFamily: fontFamily.medium,
  },
  profileMetaTextShrink: {
    flexShrink: 1,
    minWidth: 0,
  },
  profileCopyLeadingGap: {
    marginLeft: 2,
  },
  profileMetaTextFull: {
    flex: 1,
    minWidth: 0,
  },
  profileSubtitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    maxWidth: '100%',
    minWidth: 0,
    alignSelf: 'flex-start',
  },
  profileCopyIconBtn: {
    width: 18,
    height: 18,
    borderRadius: 9,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  openPill: {
    paddingHorizontal: spacing[3],
    paddingVertical: 6,
    borderRadius: borderRadius.full,
    backgroundColor: 'rgba(0, 122, 204, 0.10)',
  },
  openPillText: {
    ...textStyles.labelMedium,
    color: colors.primary.main,
    fontFamily: fontFamily.semibold,
    fontWeight: '600',
    fontSize: 13,
  },
  /** Conditional gradient banner. */
  promoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    borderRadius: borderRadius['2xl'],
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
  },
  promoIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  promoTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  promoTitle: {
    ...textStyles.bodyMedium,
    color: '#FFFFFF',
    fontFamily: fontFamily.semibold,
    fontWeight: '700',
  },
  promoSubtitle: {
    ...textStyles.bodySmall,
    color: 'rgba(255,255,255,0.85)',
    marginTop: 1,
  },
  promoCta: {
    paddingHorizontal: spacing[3],
    paddingVertical: 6,
    borderRadius: borderRadius.full,
    backgroundColor: '#FFFFFF',
  },
  promoCtaText: {
    ...textStyles.labelMedium,
    color: colors.primary.main,
    fontFamily: fontFamily.semibold,
    fontWeight: '600',
    fontSize: 13,
  },
  /** Section group: small uppercase label + SectionCard with rows inside. */
  sectionGroup: {
    gap: spacing[2],
  },
  sectionLabel: {
    fontSize: 11,
    fontFamily: fontFamily.semibold,
    fontWeight: '600',
    color: colors.text.secondary,
    letterSpacing: 0.6,
    paddingLeft: spacing[2],
  },
  sectionCard: {
    paddingHorizontal: 0,
  },
  menuItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing[4],
    paddingHorizontal: spacing[4],
    minHeight: 64,
  },
  menuItemDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border.light,
  },
  menuItemDisabled: {
    opacity: 0.5,
  },
  menuItemText: {
    ...textStyles.bodyMedium,
    color: colors.text.primary,
    fontFamily: fontFamily.semibold,
    fontWeight: '600',
  },
  menuItemTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  menuItemSubtitle: {
    ...textStyles.bodySmall,
    color: colors.text.secondary,
    marginTop: 2,
  },
  menuItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    flex: 1,
    minWidth: 0,
  },
  /** Tinted-blue circular leading icon. */
  menuItemIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 122, 204, 0.10)',
  },
  menuItemTextDisabled: {
    opacity: 0.6,
  },
  menuItemRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  destructiveText: {
    color: colors.error.main,
  },
  badgeGreen: {
    backgroundColor: colors.success.background,
    paddingHorizontal: spacing[2],
    paddingVertical: 4,
    borderRadius: borderRadius.full,
  },
  badgeTextGreen: {
    ...textStyles.labelSmall,
    color: colors.success.dark,
    fontWeight: '600',
  },
  badgeYellow: {
    backgroundColor: colors.warning.background,
    paddingHorizontal: spacing[2],
    paddingVertical: 4,
    borderRadius: borderRadius.full,
  },
  badgeTextYellow: {
    ...textStyles.labelSmall,
    color: colors.warning.dark,
    fontWeight: '600',
  },
  badgeMuted: {
    backgroundColor: colors.semantic.muted,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border.default,
    paddingHorizontal: spacing[2],
    paddingVertical: 4,
    borderRadius: borderRadius.full,
  },
  badgeTextMuted: {
    ...textStyles.labelSmall,
    color: colors.text.secondary,
    fontWeight: '600',
  },
  signOutContainer: {
    paddingTop: spacing[2],
    alignItems: 'center',
  },
  signOutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    paddingHorizontal: spacing[5],
    paddingVertical: spacing[3],
    backgroundColor: colors.semantic.card,
    borderRadius: borderRadius.full,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border.default,
  },
  signOutText: {
    ...textStyles.bodyMedium,
    color: colors.error.main,
    fontFamily: fontFamily.semibold,
    fontWeight: '600',
  },
  versionContainer: {
    alignItems: 'center',
    paddingTop: spacing[1],
    paddingBottom: spacing[1],
  },
  versionText: {
    ...textStyles.bodySmall,
    color: colors.text.tertiary,
  },
})

export default function MoreScreen(props: NavigationProps) {
  return <MoreContent {...props} />
}

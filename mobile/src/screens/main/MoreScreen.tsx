import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useFocusEffect } from '@react-navigation/native'
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable, Platform,
  Alert,
  Modal,
  ActivityIndicator,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { LinearGradient } from 'expo-linear-gradient'
import * as Haptics from 'expo-haptics'
import ScreenWrapper from '../../components/ScreenWrapper'
import { useAuth } from '../../contexts/AuthContext'
import { NavigationProps, KYCSubmission } from '../../types'
import { kycService } from '../../lib/kycService'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { colors, shadows, textStyles, borderRadius, spacing } from '../../theme'
import { useThemeColors } from '../../contexts/ThemePaletteContext'
import { ripple } from '../../lib/androidRipple'
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
import {
  isTier1Complete,
  TIER2_COMPLETE_PLACEHOLDER,
  TIER3_COMPLETE_PLACEHOLDER,
} from '../../lib/compliance'

type TierBadge = { label: string; sub?: string; tone: 'green' | 'yellow' }

function tierBadgeForProfile(
  userProfile: Parameters<typeof isTier1Complete>[0],
  verificationStatus: 'approved' | 'in_review' | 'take_action',
): TierBadge {
  const tier1 = isTier1Complete(userProfile)
  const tier2 = TIER2_COMPLETE_PLACEHOLDER
  const tier3 = TIER3_COMPLETE_PLACEHOLDER
  if (tier1 && tier2 && tier3) {
    return { label: 'Tier 3', sub: 'Verified', tone: 'green' }
  }
  if (tier1 && tier2) {
    return { label: 'Tier 2', sub: 'Verified', tone: 'green' }
  }
  if (tier1) {
    return { label: 'Tier 1', sub: 'Verified', tone: 'green' }
  }
  if (verificationStatus === 'in_review') {
    return { label: 'Tier 1', sub: 'In review', tone: 'yellow' }
  }
  return { label: 'Tier 1', sub: 'Unverified', tone: 'yellow' }
}

function MoreContent({ navigation }: NavigationProps) {
  const { user, userProfile, refreshUserProfile, signOut } = useAuth()
  const palette = useThemeColors()

  /** Main stack screens (ProfileEdit, Notifications, …) are siblings of `MainTabs`. Prefer parent `navigate` so taps work from the More tab. */
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
  const lastKycProfileRefreshRef = useRef(0)
  /** Latest profile for focus handler — avoids putting `noah_kyc_status` in `useFocusEffect` deps (would re-run MFA listFactors on every profile poll while More stays focused). */
  const userProfileRef = useRef(userProfile)
  userProfileRef.current = userProfile

  const refreshMfaStatus = useCallback(async () => {
    const genAtStart = getMfaRefreshGeneration()
    const {
      data: { session },
    } = await supabase.auth.getSession()
    if (getMfaRefreshGeneration() !== genAtStart) return
    if (!session?.user) {
      setMfaStatusLine('')
      return
    }
    const uid = session.user.id

    let cached: boolean | null = peekMfaVerified(uid)
    if (cached === null) {
      cached = await loadMfaVerifiedPersisted(uid)
    }
    if (getMfaRefreshGeneration() !== genAtStart) return

    if (cached !== null) {
      setMfaStatusLine(cached ? 'On' : 'Off')
    } else {
      setMfaStatusLine('Off')
    }

    if (cached !== null && !shouldListFactorsForMfaRow(uid)) {
      return
    }

    const { data, error } = await listFactorsForMfaStatus(supabase)
    if (getMfaRefreshGeneration() !== genAtStart) return

    if (error) {
      console.warn('MoreScreen MFA status:', error.message)
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
    await saveMfaVerified(uid, on)
  }, [])

  useFocusEffect(
    useCallback(() => {
      if (!user?.id) return
      const mem = peekMfaVerified(user.id)
      if (mem !== null) {
        setMfaStatusLine(mem ? 'On' : 'Off')
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
    }, [user?.id, refreshUserProfile, refreshMfaStatus]),
  )

  // Refresh KYC submissions when screen comes into focus
  useEffect(() => {
    if (!userProfile?.id) return

    const fetchSubmissions = async () => {
      try {
        const submissions = await kycService.getByUserId(userProfile.id)
        setKycSubmissions(submissions || [])
        
        const CACHE_KEY = `easner_kyc_submissions_${userProfile.id}`
        await AsyncStorage.setItem(CACHE_KEY, JSON.stringify({
          value: submissions || [],
          timestamp: Date.now()
        }))
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

  const getVerificationStatus = (): "approved" | "in_review" | "take_action" => {
    const role =
      userProfile?.role ?? (userProfile as { profile?: { role?: string } })?.profile?.role
    if (role === "business") {
      const kyb =
        userProfile?.noah_kyb_status ??
        (userProfile as { profile?: { noah_kyb_status?: string } })?.profile?.noah_kyb_status
      const s = String(kyb ?? "").trim().toLowerCase()
      if (s === "approved") return "approved"
      if (
        s === "pending" ||
        s === "in_review" ||
        s === "under_review"
      ) {
        return "in_review"
      }
      return "take_action"
    }
    const noahStatus =
      userProfile?.noah_kyc_status ??
      (userProfile as { profile?: { noah_kyc_status?: string } })?.profile?.noah_kyc_status

    if (noahStatus === "approved") {
      return "approved"
    }

    if (
      noahStatus === "pending" ||
      noahStatus === "in_review" ||
      noahStatus === "under_review"
    ) {
      return "in_review"
    }

    return "take_action"
  }

  const verificationStatus = getVerificationStatus()
  const tierBadge = tierBadgeForProfile(userProfile, verificationStatus)

  const handleSignOut = async () => {
    setIsLoggingOut(true)
    try {
      await signOut()
    } catch (error) {
      console.error('Error signing out:', error)
      Alert.alert('Error', 'Failed to sign out')
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
    iconName: React.ComponentProps<typeof Ionicons>['name'],
    rightComponent?: React.ReactNode,
    isDestructive: boolean = false,
    isLast: boolean = false
  ) => (
    <Pressable
     android_ripple={ripple.neutral}
      style={[styles.menuItem, isLast && styles.menuItemLast]}
      onPress={async () => {
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
        onPress()
      }} >
      <View style={styles.menuItemLeft}>
        <View style={styles.menuItemIconWrap}>
          <Ionicons name={iconName} size={18} color={colors.text.secondary} />
        </View>
        <View style={styles.menuItemTextWrap}>
          <Text style={[styles.menuItemText, isDestructive && styles.destructiveText]}>
            {title}
          </Text>
          <Text style={styles.menuItemSubtitle}>{subtitle}</Text>
        </View>
      </View>
      <View style={styles.menuItemRight}>
        {rightComponent}
        <Ionicons name="chevron-forward" size={20} color={colors.neutral[400]} />
      </View>
    </Pressable>
  )

  return (
    <ScreenWrapper>
      <View style={styles.container}>
        {/* Premium Header - Matching Card/Transaction */}
        <View style={styles.header}>
          <Text style={styles.title}>More</Text>
        </View>

        <ScrollView
          style={styles.scrollContainer}
          contentContainerStyle={{
            flexGrow: 1,
            paddingBottom: spacing[8],
          }}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.content}>
          {/* Account Section */}
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Account</Text>
            <View style={styles.sectionContent}>
              {renderMenuItem(
                'Your Profile',
                'Name, email, and personal details',
                () => navigation.navigate('ProfileEdit' as never),
                'person-outline',
                undefined,
                false,
                false
              )}
              <Pressable
               android_ripple={ripple.neutral}
                style={styles.menuItem}
                onPress={async () => {
                  await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
                  navigateFromMoreTab('AccountVerification')
                }} >
                <View style={styles.menuItemLeft}>
                  <View style={styles.menuItemIconWrap}>
                    <Ionicons name="shield-checkmark-outline" size={18} color={colors.text.secondary} />
                  </View>
                  <View style={styles.menuItemTextWrap}>
                    <Text style={styles.menuItemText}>Account verification</Text>
                    <Text style={styles.menuItemSubtitle}>Tier status and onboarding progress</Text>
                  </View>
                </View>
                <View style={styles.menuItemRight}>
                  {tierBadge.tone === 'green' ? (
                    <View style={[styles.badgeGreen, tierBadge.sub && styles.badgeGreenTall]}>
                      <Text style={styles.badgeTextGreen}>{tierBadge.label}</Text>
                      {tierBadge.sub ? (
                        <Text style={styles.badgeTextGreenSub}>{tierBadge.sub}</Text>
                      ) : null}
                    </View>
                  ) : (
                    <View style={[styles.badgeYellow, tierBadge.sub && styles.badgeYellowTall]}>
                      <Text style={styles.badgeTextYellow}>{tierBadge.label}</Text>
                      {tierBadge.sub ? (
                        <Text style={styles.badgeTextYellowSub}>{tierBadge.sub}</Text>
                      ) : null}
                    </View>
                  )}
                  <Ionicons name="chevron-forward" size={20} color={colors.neutral[400]} />
                </View>
              </Pressable>
              {renderMenuItem(
                'Notifications',
                'Alerts, pushes, and communication settings',
                () => navigation.navigate('Notifications' as never),
                'notifications-outline',
                undefined,
                false,
                false
              )}
              {renderMenuItem(
                'Recipients',
                'Saved people and payout destinations',
                () => navigateFromMoreTab('Recipients'),
                'people-outline',
                undefined,
                false,
                true
              )}
            </View>
          </View>

          {/* Security */}
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Security</Text>
            <View style={styles.sectionContent}>
              {renderMenuItem(
                'Change PIN',
                'Update your app unlock PIN',
                () => navigateFromMoreTab('ChangePin'),
                'key-outline',
                undefined,
                false,
                false
              )}
              {renderMenuItem(
                'Change password',
                'Reset your login password securely',
                () => navigateFromMoreTab('ChangePassword'),
                'lock-closed-outline',
                undefined,
                false,
                false
              )}
              {renderMenuItem(
                'Two-Factor Authentication',
                'Manage authenticator app protection',
                handleMfaRowPress,
                'shield-outline',
                <View style={mfaStatusLine === 'On' ? styles.badgeGreen : styles.badgeMuted}>
                  <Text
                    style={mfaStatusLine === 'On' ? styles.badgeTextGreen : styles.badgeTextMuted}
                  >
                    {mfaStatusLine === 'On' ? 'On' : 'Off'}
                  </Text>
                </View>,
                false,
                true
              )}
            </View>
          </View>

          {/* App Section */}
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>App</Text>
            <View style={styles.sectionContent}>
              {renderMenuItem(
                'Support',
                'Get help and contact our team',
                () => navigateFromMoreTab('Support'),
                'help-circle-outline',
                undefined,
                false,
                false
              )}
              {renderMenuItem(
                'Legal',
                'Privacy policy and terms of service',
                () => navigateFromMoreTab('Legal'),
                'document-text-outline',
                undefined,
                false,
                true
              )}
            </View>
          </View>

          {/* Sign Out Button */}
          <View style={styles.signOutContainer}>
            <Pressable
             android_ripple={ripple.neutral}
              style={styles.signOutButton}
              onPress={async () => {
                await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
                setShowLogoutDialog(true)
              }} >
              <Ionicons name="log-out-outline" size={20} color={colors.error.main} />
              <Text style={styles.signOutText}>Logout</Text>
            </Pressable>
          </View>

          {/* App Version */}
          <View style={styles.versionContainer}>
            <Text style={styles.versionText}>Version 1.0.0</Text>
          </View>
          </View>
        </ScrollView>
      </View>

      {/* Logout Confirmation Dialog */}
      <Modal
        visible={showLogoutDialog}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowLogoutDialog(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Logout</Text>
            <Text style={styles.modalDescription}>
              Are you sure you want to logout? You'll need to sign in again to access your account.
            </Text>
            <View style={styles.modalButtons}>
              <Pressable
               android_ripple={ripple.neutral}
                style={[styles.modalButton, styles.modalButtonCancel]}
                onPress={() => setShowLogoutDialog(false)}
                disabled={isLoggingOut}
              >
                <Text style={styles.modalButtonTextCancel}>Cancel</Text>
              </Pressable>
              <Pressable
               android_ripple={ripple.neutral}
                style={[styles.modalButton, styles.modalButtonConfirm]}
                onPress={handleSignOut}
                disabled={isLoggingOut}
              >
                {isLoggingOut ? (
                  <ActivityIndicator color="#ffffff" />
                ) : (
                  <Text style={styles.modalButtonTextConfirm}>Logout</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

    </ScreenWrapper>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background.primary,
  },
  scrollContainer: {
    flex: 1,
  },
  header: {
    paddingHorizontal: spacing[5],
    paddingTop: spacing[4],
    paddingBottom: spacing[2],
  },
  title: {
    ...textStyles.headlineLarge,
    color: colors.text.primary,
  },
  content: {
    padding: spacing[5],
    gap: spacing[4],
  },
  sectionCard: {
    backgroundColor: colors.frame.background,
    borderRadius: 24,
    borderWidth: 0.5,
    borderColor: colors.frame.border,
    marginBottom: spacing[4],
    paddingBottom: spacing[2],
  },
  sectionTitle: {
    ...textStyles.titleLarge,
    color: colors.text.primary,
    fontFamily: 'Outfit-SemiBold',
    paddingHorizontal: spacing[5],
    paddingTop: spacing[5],
    paddingBottom: spacing[3],
  },
  sectionContent: {
    paddingHorizontal: spacing[5],
    paddingBottom: spacing[2],
  },
  appearanceBlock: {
    marginHorizontal: -spacing[5],
    paddingHorizontal: spacing[5],
    paddingBottom: spacing[3],
    marginBottom: spacing[1],
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  appearanceChips: {
    flexDirection: 'row',
    gap: spacing[2],
  },
  appearanceChip: {
    flex: 1,
    paddingVertical: spacing[3],
    paddingHorizontal: spacing[2],
    borderRadius: borderRadius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  menuItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing[4],
    borderBottomWidth: 1,
    borderBottomColor: colors.frame.border,
  },
  menuItemLast: {
    borderBottomWidth: 0,
  },
  menuItemDisabled: {
    opacity: 0.5,
  },
  menuItemText: {
    ...textStyles.bodyMedium,
    color: colors.text.primary,
    fontFamily: 'Outfit-Medium',
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
  menuItemIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background.primary,
    borderWidth: 0.5,
    borderColor: colors.frame.border,
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
    paddingVertical: spacing[1],
    borderRadius: borderRadius.sm,
  },
  badgeGreenTall: {
    paddingVertical: spacing[1] + 1,
    alignItems: 'flex-end',
  },
  badgeTextGreen: {
    ...textStyles.labelSmall,
    color: colors.success.dark,
    fontWeight: '600',
  },
  badgeTextGreenSub: {
    ...textStyles.bodySmall,
    color: colors.success.dark,
    fontWeight: '500',
    marginTop: 1,
    fontSize: 10,
    lineHeight: 12,
  },
  badgeYellow: {
    backgroundColor: colors.warning.background,
    paddingHorizontal: spacing[2],
    paddingVertical: spacing[1],
    borderRadius: borderRadius.sm,
  },
  badgeYellowTall: {
    paddingVertical: spacing[1] + 1,
    alignItems: 'flex-end',
  },
  badgeTextYellow: {
    ...textStyles.labelSmall,
    color: colors.warning.dark,
    fontWeight: '600',
  },
  badgeTextYellowSub: {
    ...textStyles.bodySmall,
    color: colors.warning.dark,
    fontWeight: '500',
    marginTop: 1,
    fontSize: 10,
    lineHeight: 12,
  },
  badgeMuted: {
    backgroundColor: colors.neutral[100],
    paddingHorizontal: spacing[2],
    paddingVertical: spacing[1],
    borderRadius: borderRadius.sm,
  },
  badgeTextMuted: {
    ...textStyles.labelSmall,
    color: colors.text.secondary,
    fontWeight: '600',
  },
  signOutContainer: {
    paddingTop: spacing[3],
    alignItems: 'center',
  },
  signOutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    borderRadius: borderRadius.xl,
    backgroundColor: colors.frame.background,
    borderWidth: 0.5,
    borderColor: colors.frame.border,
  },
  signOutText: {
    ...textStyles.bodyMedium,
    color: colors.error.main,
    fontWeight: '500',
  },
  versionContainer: {
    alignItems: 'center',
    paddingTop: spacing[2],
    paddingBottom: spacing[10],
  },
  versionText: {
    ...textStyles.bodySmall,
    color: colors.text.tertiary,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing[5],
  },
  modalContent: {
    backgroundColor: colors.background.primary,
    borderRadius: borderRadius['3xl'],
    padding: spacing[6],
    width: '100%',
    maxWidth: 400,
    borderWidth: 0.5,
    borderColor: colors.frame.border,
  },
  modalTitle: {
    ...textStyles.titleLarge,
    color: colors.text.primary,
    marginBottom: spacing[2],
  },
  modalDescription: {
    ...textStyles.bodyMedium,
    color: colors.text.secondary,
    marginBottom: spacing[6],
    lineHeight: 20,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: spacing[3],
  },
  modalButton: {
    flex: 1,
    paddingVertical: spacing[3],
    borderRadius: borderRadius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalButtonCancel: {
    backgroundColor: colors.frame.background,
    borderWidth: 0.5,
    borderColor: colors.frame.border,
  },
  modalButtonConfirm: {
    backgroundColor: colors.error.main,
  },
  modalButtonTextCancel: {
    ...textStyles.bodyMedium,
    fontWeight: '500',
    color: colors.text.primary,
  },
  modalButtonTextConfirm: {
    ...textStyles.bodyMedium,
    fontWeight: '500',
    color: colors.text.inverse,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: colors.background.primary,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing[5],
    paddingTop: spacing[4],
    paddingBottom: spacing[3],
    borderBottomWidth: 1,
    borderBottomColor: colors.border.light,
  },
  modalCloseButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.frame.background,
    borderWidth: 0.5,
    borderColor: colors.frame.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  webView: {
    flex: 1,
  },
  loadingContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background.primary,
    zIndex: 1,
  },
})

export default function MoreScreen(props: NavigationProps) {
  return <MoreContent {...props} />
}


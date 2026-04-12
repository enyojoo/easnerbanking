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
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import ScreenWrapper from '../../components/ScreenWrapper'
import ExternalLinkModal from '../../components/ExternalLinkModal'
import { useExternalLink } from '../../hooks/useExternalLink'
import { useAuth } from '../../contexts/AuthContext'
import { NavigationProps, KYCSubmission } from '../../types'
import { kycService } from '../../lib/kycService'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { colors, shadows, textStyles, borderRadius, spacing, layout } from '../../theme'
import { ripple } from '../../lib/androidRipple'
import { supabase } from '../../lib/supabase'
import {
  getVerifiedTotpFactorId,
  listFactorsForMfaStatus,
  totpFactorsFromListResponse,
  unenrollUnverifiedTotpFactors,
} from '../../lib/auth-mfa'
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
    return { label: 'Tier 3', tone: 'green' }
  }
  if (tier1 && tier2) {
    return { label: 'Tier 2', tone: 'green' }
  }
  if (tier1) {
    return { label: 'Tier 1', tone: 'green' }
  }
  if (verificationStatus === 'in_review') {
    return { label: 'Tier 1', sub: 'In review', tone: 'yellow' }
  }
  return { label: 'Tier 1', sub: 'Action needed', tone: 'yellow' }
}

function MoreContent({ navigation }: NavigationProps) {
  const { user, userProfile, refreshUserProfile, signOut } = useAuth()
  const insets = useSafeAreaInsets()

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
  const privacyLink = useExternalLink()
  const termsLink = useExternalLink()
  const [mfaStatusLine, setMfaStatusLine] = useState('')
  const [mfaStatusKnown, setMfaStatusKnown] = useState(false)
  const lastKycProfileRefreshRef = useRef(0)

  const refreshMfaStatus = useCallback(async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession()
    if (!session?.user) {
      setMfaStatusLine('')
      setMfaStatusKnown(false)
      return
    }
    const { data, error } = await listFactorsForMfaStatus(supabase)
    if (error) {
      console.warn('MoreScreen MFA status:', error.message)
      setMfaStatusLine('Unable to load')
      setMfaStatusKnown(true)
      return
    }
    const totp = totpFactorsFromListResponse(data)
    const id = getVerifiedTotpFactorId(totp)
    if (!id && totp.some((f) => f.status === 'unverified')) {
      await unenrollUnverifiedTotpFactors(supabase)
    }
    setMfaStatusLine(id ? 'On' : 'Off')
    setMfaStatusKnown(true)
  }, [])

  useFocusEffect(
    useCallback(() => {
      if (!user?.id) return
      const noahKycStatus =
        userProfile?.noah_kyc_status ?? (userProfile as { profile?: { noah_kyc_status?: string } })?.profile?.noah_kyc_status
      if (noahKycStatus !== 'approved') {
        const now = Date.now()
        if (now - lastKycProfileRefreshRef.current > 60_000) {
          lastKycProfileRefreshRef.current = now
          void refreshUserProfile()
        }
      }
      void refreshMfaStatus()
    }, [user?.id, userProfile?.noah_kyc_status, refreshUserProfile, refreshMfaStatus]),
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

  const handlePrivacy = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    privacyLink.openLink('https://www.easner.com/privacy', 'Privacy Policy')
  }

  const handleTerms = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    termsLink.openLink('https://www.easner.com/terms', 'Terms of Service')
  }

  const handleMfaRowPress = () => {
    if (!mfaStatusKnown) return
    navigateFromMoreTab('MfaSetup', {
      autoStartEnroll: mfaStatusLine === 'Off',
      mfaVerifiedOnCard: mfaStatusLine === 'On',
    })
  }

  const renderMenuItem = (
    title: string,
    onPress: () => void,
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
      <Text style={[styles.menuItemText, isDestructive && styles.destructiveText]}>
        {title}
      </Text>
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
            paddingBottom: insets.bottom + layout.tabBarHeight + spacing[6],
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
                () => navigation.navigate('ProfileEdit' as never),
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
                <Text style={styles.menuItemText}>Account verification</Text>
                <View style={styles.menuItemRight}>
                  {tierBadge.tone === 'green' ? (
                    <View style={styles.badgeGreen}>
                      <Text style={styles.badgeTextGreen}>{tierBadge.label}</Text>
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
                () => navigation.navigate('Notifications' as never),
                undefined,
                false,
                false
              )}
              {renderMenuItem(
                'Recipients',
                () => navigateFromMoreTab('Recipients'),
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
                () => navigateFromMoreTab('ChangePin'),
                undefined,
                false,
                false
              )}
              {renderMenuItem(
                'Change password',
                () => navigateFromMoreTab('ChangePassword'),
                undefined,
                false,
                false
              )}
              {renderMenuItem(
                'Two-Factor Authentication',
                handleMfaRowPress,
                !mfaStatusKnown ? (
                  <ActivityIndicator size="small" color={colors.primary.main} />
                ) : (
                  <View style={mfaStatusLine === 'On' ? styles.badgeGreen : styles.badgeMuted}>
                    <Text
                      style={mfaStatusLine === 'On' ? styles.badgeTextGreen : styles.badgeTextMuted}
                    >
                      {mfaStatusLine}
                    </Text>
                  </View>
                ),
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
                () => navigateFromMoreTab('Support'),
                undefined,
                false,
                false
              )}
              {renderMenuItem(
                'Privacy Policy',
                handlePrivacy,
                undefined,
                false,
                false
              )}
              {renderMenuItem(
                'Terms of Service',
                handleTerms,
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

      {/* External Link Modals */}
      <ExternalLinkModal
        visible={privacyLink.isVisible}
        url={privacyLink.url}
        title={privacyLink.title}
        onClose={privacyLink.closeLink}
      />
      <ExternalLinkModal
        visible={termsLink.isVisible}
        url={termsLink.url}
        title={termsLink.title}
        onClose={termsLink.closeLink}
          />
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
    backgroundColor: '#F9F9F9',
    borderRadius: 24,
    borderWidth: 0.5,
    borderColor: '#E2E2E2',
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
  menuItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing[4],
    borderBottomWidth: 1,
    borderBottomColor: '#E2E2E2',
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
  badgeTextGreen: {
    ...textStyles.labelSmall,
    color: colors.success.dark,
    fontWeight: '600',
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
    backgroundColor: '#F9F9F9',
    borderWidth: 0.5,
    borderColor: '#E2E2E2',
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
    borderColor: '#E2E2E2',
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
    backgroundColor: '#F9F9F9',
    borderWidth: 0.5,
    borderColor: '#E2E2E2',
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


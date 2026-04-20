import React, { useState, useRef, useEffect, useCallback } from 'react'
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable, Platform,
  Switch,
  Animated,
  ActivityIndicator,
  Alert,
} from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import { Ionicons } from '@expo/vector-icons'
import * as Haptics from 'expo-haptics'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import type { CommunicationPreferences } from '@easner/shared'
import { COMMUNICATION_PREFERENCES_DISCLAIMER, qk } from '@easner/shared'
import { useQueryClient } from '@tanstack/react-query'
import ScreenWrapper from '../../components/ScreenWrapper'
import { useAuth } from '../../contexts/AuthContext'
import { useCommunicationPreferences } from '../../hooks/queries'
import { NavigationProps } from '../../types'
import { colors, textStyles, spacing, motion } from '../../theme'
import { useCalmParallelEnterWhen } from '../../hooks/useCalmParallelEnter'
import { ripple } from '../../lib/androidRipple'
import { apiPatch, apiPost } from '../../lib/apiClient'
import { pushNotificationService } from '../../lib/pushNotificationService'

export default function NotificationsScreen({ navigation }: NavigationProps) {
  const insets = useSafeAreaInsets()
  const { user } = useAuth()
  const qc = useQueryClient()
  const commQuery = useCommunicationPreferences()
  const communicationPreferences = commQuery.data ?? null
  const communicationPreferencesLoading = commQuery.isPending
  const refreshCommunicationPreferences = useCallback(() => commQuery.refetch(), [commQuery])
  const commitCommunicationPreferences = async (prefs: CommunicationPreferences) => {
    if (!user?.id) return
    qc.setQueryData(qk.settings.communication(user.id), prefs)
  }

  const [saving, setSaving] = useState(false)
  const [optimisticOverride, setOptimisticOverride] = useState<CommunicationPreferences | null>(null)

  const prefs = optimisticOverride ?? communicationPreferences
  const loadingPrefs =
    communicationPreferencesLoading && !communicationPreferences && !optimisticOverride

  const headerAnim = useRef(new Animated.Value(0)).current
  const contentAnim = useRef(new Animated.Value(0)).current

  useFocusEffect(
    useCallback(() => {
      setOptimisticOverride(null)
      void refreshCommunicationPreferences()
    }, [refreshCommunicationPreferences]),
  )

  useCalmParallelEnterWhen(true, headerAnim, contentAnim)

  const patchPrefs = async (next: CommunicationPreferences) => {
    const res = await apiPatch('/api/settings/communication', {
      productUpdates: next.productUpdates,
      securityAlerts: next.securityAlerts,
      marketingEmails: next.marketingEmails,
      channels: next.channels,
    })
    const j = (await res.json()) as { preferences?: CommunicationPreferences; error?: string }
    if (!res.ok) throw new Error(j.error || 'Save failed')
    if (j.preferences) {
      await commitCommunicationPreferences(j.preferences)
    }
  }

  const patch = async (partial: Partial<CommunicationPreferences>) => {
    if (!prefs || saving) return
    setSaving(true)
    const optimistic: CommunicationPreferences = {
      ...prefs,
      ...partial,
      channels: partial.channels
        ? { ...prefs.channels, ...partial.channels }
        : prefs.channels,
    }
    setOptimisticOverride(optimistic)
    try {
      await patchPrefs(optimistic)
      setOptimisticOverride(null)
    } catch {
      setOptimisticOverride(null)
    } finally {
      setSaving(false)
    }
  }

  const handlePushToggle = async (wantPush: boolean) => {
    if (!prefs || saving) return
    setSaving(true)
    if (wantPush) {
      const optimistic: CommunicationPreferences = {
        ...prefs,
        channels: { ...prefs.channels, push: true },
      }
      setOptimisticOverride(optimistic)
      try {
        const token = await pushNotificationService.registerForPushNotifications()
        if (!token) {
          setOptimisticOverride(null)
          Alert.alert(
            'Push notifications',
            'Push was not enabled. Use a physical device and allow notifications in Settings if you previously denied them.',
          )
          setSaving(false)
          return
        }
        await apiPost('/api/settings/push-token', { expoPushToken: token })
        await patchPrefs({
          ...optimistic,
          channels: { ...optimistic.channels, push: true },
        })
        setOptimisticOverride(null)
      } catch {
        setOptimisticOverride(null)
      } finally {
        setSaving(false)
      }
    } else {
      const optimistic: CommunicationPreferences = {
        ...prefs,
        channels: { ...prefs.channels, push: false },
      }
      setOptimisticOverride(optimistic)
      try {
        await patchPrefs(optimistic)
        await pushNotificationService.clearLocalPushToken()
        await apiPost('/api/settings/push-token', { expoPushToken: null })
        setOptimisticOverride(null)
      } catch {
        setOptimisticOverride(null)
      } finally {
        setSaving(false)
      }
    }
  }

  const renderToggleItem = (
    title: string,
    description: string,
    value: boolean,
    onValueChange: (v: boolean) => void,
    isLast: boolean = false,
  ) => (
    <View style={[styles.toggleItem, !isLast && styles.toggleItemBorder]}>
      <View style={styles.toggleInfo}>
        <Text style={styles.toggleTitle}>{title}</Text>
        <Text style={styles.toggleDescription}>{description}</Text>
      </View>
      <Switch
        value={value}
        disabled={saving || loadingPrefs}
        onValueChange={async (v) => {
          await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
          onValueChange(v)
        }}
        trackColor={{ false: '#d1d5db', true: colors.primary.main }}
        thumbColor="#ffffff"
        ios_backgroundColor="#d1d5db"
      />
    </View>
  )

  return (
    <ScreenWrapper>
      <View style={styles.container}>
        <ScrollView
          style={styles.scrollContainer}
          contentContainerStyle={{ paddingBottom: insets.bottom + spacing[5] }}
          showsVerticalScrollIndicator={false}
        >
          <Animated.View
            style={[
              styles.header,
              {
                opacity: headerAnim,
                transform: [
                  {
                    translateY: headerAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [-motion.screenEnterTranslateY, 0],
                    }),
                  },
                ],
              },
            ]}
          >
            <Pressable
             android_ripple={ripple.neutral}
              onPress={async () => {
                await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
                navigation.goBack()
              }}
              style={styles.backButton} >
              <Ionicons name="arrow-back" size={24} color={colors.text.primary} />
            </Pressable>
            <View style={styles.headerContent}>
              <Text style={styles.title}>Notifications</Text>
            </View>
          </Animated.View>

          <Animated.View
            style={[
              styles.content,
              {
                opacity: contentAnim,
                transform: [
                  {
                    translateY: contentAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [motion.screenEnterTranslateY, 0],
                    }),
                  },
                ],
              },
            ]}
          >
            {loadingPrefs ? (
              <View style={styles.loading}>
                <ActivityIndicator color={colors.primary.main} />
              </View>
            ) : !user ? (
              <Text style={styles.fallback}>
                Sign in to load your preferences.
              </Text>
            ) : !prefs ? (
              <Text style={styles.fallback}>
                Preferences could not be loaded. Check your connection and try again.
              </Text>
            ) : (
              <>
                <View style={styles.sectionCard}>
                  <Text style={styles.sectionTitle}>Push</Text>
                  <View style={styles.sectionContent}>
                    {renderToggleItem(
                      'Push notifications',
                      'Alerts on this device when enabled (requires permission)',
                      prefs.channels.push,
                      (v) => void handlePushToggle(v),
                      true,
                    )}
                  </View>
                </View>

                <View style={styles.sectionCard}>
                  <Text style={styles.sectionTitle}>Email types</Text>
                  <View style={styles.sectionContent}>
                    {renderToggleItem(
                      'Product updates',
                      'New features and improvements',
                      prefs.productUpdates,
                      (v) => patch({ productUpdates: v }),
                    )}
                    {renderToggleItem(
                      'Security alerts',
                      'Important security notifications',
                      prefs.securityAlerts,
                      (v) => patch({ securityAlerts: v }),
                    )}
                    {renderToggleItem(
                      'Marketing',
                      'News, tips, and promotions',
                      prefs.marketingEmails,
                      (v) => patch({ marketingEmails: v }),
                      true,
                    )}
                  </View>
                </View>

                <Text style={styles.disclaimer}>{COMMUNICATION_PREFERENCES_DISCLAIMER}</Text>
              </>
            )}
          </Animated.View>
        </ScrollView>
      </View>
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
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing[5],
    paddingTop: spacing[4],
    paddingBottom: spacing[4],
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.frame.background,
    borderWidth: 0.5,
    borderColor: colors.frame.border,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing[3],
  },
  headerContent: {
    flex: 1,
  },
  title: {
    ...textStyles.headlineMedium,
    color: colors.text.primary,
  },
  content: {
    padding: spacing[5],
    gap: spacing[4],
  },
  loading: {
    paddingVertical: spacing[8],
    alignItems: 'center',
  },
  fallback: {
    ...textStyles.bodyMedium,
    color: colors.text.secondary,
    lineHeight: 22,
  },
  /** Slightly smaller than bodySmall for legal-style footer copy ("We may still…"). */
  disclaimer: {
    fontFamily: textStyles.bodySmall.fontFamily,
    fontSize: 10,
    lineHeight: 14,
    color: colors.text.secondary,
    opacity: 0.9,
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
    paddingHorizontal: spacing[5],
    paddingTop: spacing[5],
    paddingBottom: spacing[3],
  },
  sectionContent: {
    paddingHorizontal: spacing[5],
    paddingBottom: spacing[2],
  },
  toggleItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing[4],
  },
  toggleItemBorder: {
    borderBottomWidth: 1,
    borderBottomColor: '#E2E2E2',
  },
  toggleInfo: {
    flex: 1,
    marginRight: spacing[4],
  },
  toggleTitle: {
    ...textStyles.bodyMedium,
    color: colors.text.primary,
    fontFamily: 'Outfit-Medium',
    marginBottom: spacing[1],
  },
  toggleDescription: {
    ...textStyles.bodySmall,
    color: colors.text.secondary,
  },
})

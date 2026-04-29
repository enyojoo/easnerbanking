import React, { useState, useRef, useCallback } from 'react'
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable, Platform,
  Switch,
  Animated,
} from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import { ArrowLeft } from 'lucide-react-native'
import * as Haptics from 'expo-haptics'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import type { CommunicationPreferences } from '@easner/shared'
import { DEFAULT_COMMUNICATION_PREFERENCES, qk } from '@easner/shared'
import { useQueryClient } from '@tanstack/react-query'
import ScreenWrapper from '../../components/ScreenWrapper'
import { useAuth } from '../../contexts/AuthContext'
import { useCommunicationPreferences } from '../../hooks/queries'
import { NavigationProps } from '../../types'
import { colors, surfaceFrameStyle, surfaceChromeCircleStyle, textStyles, spacing, motion, fontFamily } from '../../theme'
import { useCalmParallelEnterWhen } from '../../hooks/useCalmParallelEnter'
import { ripple } from '../../lib/androidRipple'
import { apiPatch, apiPost } from '../../lib/apiClient'
import { pushNotificationService } from '../../lib/pushNotificationService'
import { useToast } from '../../components/ToastProvider'

export default function NotificationsScreen({ navigation }: NavigationProps) {
  const insets = useSafeAreaInsets()
  const { user } = useAuth()
  const { showWarning } = useToast()
  const qc = useQueryClient()
  const commQuery = useCommunicationPreferences()
  const communicationPreferences =
    commQuery.data ?? {
      ...DEFAULT_COMMUNICATION_PREFERENCES,
      channels: { ...DEFAULT_COMMUNICATION_PREFERENCES.channels },
    }
  const commitCommunicationPreferences = async (prefs: CommunicationPreferences) => {
    if (!user?.id) return
    qc.setQueryData(qk.settings.communication(user.id), prefs)
  }

  const prefs = communicationPreferences

  const headerAnim = useRef(new Animated.Value(0)).current
  const contentAnim = useRef(new Animated.Value(0)).current

  useFocusEffect(
    useCallback(() => {
      if (commQuery.isStale) {
        void commQuery.refetch()
      }
    }, [commQuery.isStale, commQuery.refetch]),
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
    if (!prefs) return
    const optimistic: CommunicationPreferences = {
      ...prefs,
      ...partial,
      channels: partial.channels
        ? { ...prefs.channels, ...partial.channels }
        : prefs.channels,
    }
    await commitCommunicationPreferences(optimistic)
    try {
      await patchPrefs(optimistic)
    } catch {
      // Keep user's chosen state in UI; background sync/retry can reconcile later.
    }
  }

  const handlePushToggle = async (wantPush: boolean) => {
    if (!prefs) return
    if (wantPush) {
      const optimistic: CommunicationPreferences = {
        ...prefs,
        channels: { ...prefs.channels, push: true },
      }
      await commitCommunicationPreferences(optimistic)
      try {
        const token = await pushNotificationService.registerForPushNotifications()
        if (!token) {
          showWarning(
            'Push was not enabled. Use a physical device and allow notifications in Settings if you previously denied them.',
          )
          return
        }
        await apiPost('/api/settings/push-token', { expoPushToken: token })
        await patchPrefs({
          ...optimistic,
          channels: { ...optimistic.channels, push: true },
        })
      } catch {
        // Keep chosen state in UI.
      }
    } else {
      const optimistic: CommunicationPreferences = {
        ...prefs,
        channels: { ...prefs.channels, push: false },
      }
      await commitCommunicationPreferences(optimistic)
      try {
        await patchPrefs(optimistic)
        await pushNotificationService.clearLocalPushToken()
        await apiPost('/api/settings/push-token', { expoPushToken: null })
      } catch {
        // Keep chosen state in UI.
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
        onValueChange={async (v) => {
          await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
          onValueChange(v)
        }}
        trackColor={{ false: colors.border.dark, true: colors.primary.main }}
        thumbColor={colors.neutral.white}
        ios_backgroundColor={colors.border.dark}
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
              <ArrowLeft size={24} color={colors.primary.main} strokeWidth={2} />
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
            {!user ? (
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
                      'Alerts on this device when enabled',
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
    ...surfaceChromeCircleStyle(colors, 44),
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
  fallback: {
    ...textStyles.bodyMedium,
    color: colors.text.secondary,
    lineHeight: 22,
  },
  sectionCard: {
    ...surfaceFrameStyle(colors),
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
    borderBottomColor: colors.frame.border,
  },
  toggleInfo: {
    flex: 1,
    marginRight: spacing[4],
  },
  toggleTitle: {
    ...textStyles.bodyMedium,
    color: colors.text.primary,
    fontFamily: fontFamily.medium,
    marginBottom: spacing[1],
  },
  toggleDescription: {
    ...textStyles.bodySmall,
    color: colors.text.secondary,
  },
})

import React, { useCallback } from 'react'
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Linking,
  Alert,
} from 'react-native'
import { ArrowLeft, ChevronRight } from 'lucide-react-native'
import { useFocusEffect } from '@react-navigation/native'
import ScreenWrapper from '../../components/ScreenWrapper'
import { NavigationProps } from '../../types'
import { analytics } from '../../lib/analytics'
import { intercomPresentErrorMessage, presentIntercomMessenger, prepareIntercomMessenger } from '../../lib/intercom'
import { colors, surfaceFrameStyle, surfaceChromeCircleStyle, textStyles, spacing } from '../../theme'
import { ripple } from '../../lib/androidRipple'
import { haptics } from '../../lib/haptics'
import { useScrollBottomPadding } from '../../hooks/useScrollBottomPadding'

export default function SupportScreen({ navigation }: NavigationProps) {
  const scrollBottomPadding = useScrollBottomPadding(spacing[4])

  useFocusEffect(
    useCallback(() => {
      analytics.trackScreenView('Support')
      void prepareIntercomMessenger()
    }, []),
  )

  const handleLiveChat = () => {
    analytics.trackSupportLiveChatOpened()
    void presentIntercomMessenger().catch((e) => {
      Alert.alert('Live chat', intercomPresentErrorMessage(e))
    })
  }

  const handleEmailSupport = () => {
    const email = 'support@easner.com'
    const subject = 'Support Request'
    Linking.openURL(`mailto:${email}?subject=${encodeURIComponent(subject)}`)
  }

  const renderContactButton = (
    title: string,
    onPress: () => void,
    icon: string,
    isLast: boolean = false,
    subtitle?: string,
  ) => (
    <Pressable
      android_ripple={ripple.neutral}
      style={[styles.contactButton, isLast && styles.contactButtonLast]}
      onPress={() => {
        haptics.tap()
        onPress()
      }}
    >
      <Text style={styles.contactIcon}>{icon}</Text>
      <View style={styles.contactInfo}>
        <Text style={styles.contactTitle}>{title}</Text>
        {subtitle ? <Text style={styles.contactSubtitle}>{subtitle}</Text> : null}
      </View>
      <ChevronRight size={20} color={colors.neutral[400]} strokeWidth={2} />
    </Pressable>
  )

  return (
    <ScreenWrapper>
      <View style={styles.container}>
        <View style={styles.header}>
          <Pressable
            android_ripple={ripple.neutral}
            style={styles.backButton}
            onPress={() => {
              haptics.tap()
              navigation.goBack()
            }}
          >
            <ArrowLeft size={24} color={colors.primary.main} strokeWidth={2} />
          </Pressable>
          <View style={styles.headerContent}>
            <Text style={styles.title}>Support</Text>
          </View>
        </View>

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: scrollBottomPadding }]}
        >
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Get in Touch</Text>
            {renderContactButton(
              'Live Chat',
              handleLiveChat,
              '💬',
              false,
              'Message our team in the app',
            )}
            {renderContactButton('Email Support', handleEmailSupport, '📧', true, 'support@easner.com')}
          </View>
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
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: spacing[5],
  },
  sectionCard: {
    ...surfaceFrameStyle(colors),
    paddingBottom: spacing[2],
  },
  sectionTitle: {
    ...textStyles.titleLarge,
    color: colors.text.primary,
    marginBottom: spacing[4],
    paddingHorizontal: spacing[5],
    paddingTop: spacing[5],
  },
  contactButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing[4],
    paddingHorizontal: spacing[5],
    borderBottomWidth: 1,
    borderBottomColor: colors.frame.border,
  },
  contactButtonLast: {
    borderBottomWidth: 0,
  },
  contactIcon: {
    fontSize: 24,
    marginRight: spacing[4],
  },
  contactInfo: {
    flex: 1,
  },
  contactTitle: {
    ...textStyles.bodyMedium,
    fontWeight: '500',
    color: colors.text.primary,
  },
  contactSubtitle: {
    ...textStyles.bodySmall,
    color: colors.text.secondary,
    marginTop: 2,
  },
})

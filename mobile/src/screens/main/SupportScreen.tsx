import React, { useEffect, useState, useRef } from 'react'
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Linking,
  Animated,
  Platform,
  Alert,
} from 'react-native'
import { ArrowLeft, ChevronRight } from 'lucide-react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import ScreenWrapper from '../../components/ScreenWrapper'
import { NavigationProps } from '../../types'
import { analytics } from '../../lib/analytics'
import { presentIntercomMessenger } from '../../lib/intercom'
import { colors, surfaceFrameStyle, surfaceChromeCircleStyle, textStyles, borderRadius, spacing, motion, fontFamily } from '../../theme'
import { useCalmParallelEnterWhen } from '../../hooks/useCalmParallelEnter'
import { ripple } from '../../lib/androidRipple'
import { haptics } from '../../lib/haptics'

export default function SupportScreen({ navigation }: NavigationProps) {
  const insets = useSafeAreaInsets()
  const [expandedFAQ, setExpandedFAQ] = useState<number | null>(null)

  // Animation refs
  const headerAnim = useRef(new Animated.Value(0)).current
  const contentAnim = useRef(new Animated.Value(0)).current

  // Run entrance animations
  useCalmParallelEnterWhen(true, headerAnim, contentAnim)

  // Track screen view
  useEffect(() => {
    analytics.trackScreenView('Support')
  }, [])

  const handleLiveChat = async () => {
    try {
      analytics.trackSupportLiveChatOpened()
      await presentIntercomMessenger()
    } catch (e) {
      const message =
        e instanceof Error && e.message === 'INTERCOM_NOT_CONFIGURED'
          ? 'Live chat is not available in this build. Set Intercom env and rebuild, or use email support.'
          : e instanceof Error && e.message === 'INTERCOM_JWT_UNAVAILABLE'
            ? 'Could not refresh chat login. Check your connection and that the Easner API can mint Intercom tokens (INTERCOM_MESSENGER_API_SECRET on the server).'
            : 'Could not open chat. Please try again or use email support.'
      Alert.alert('Live chat', message)
    }
  }

  const handleEmailSupport = () => {
    const email = 'support@easner.com'
    const subject = 'Support Request'
    Linking.openURL(`mailto:${email}?subject=${encodeURIComponent(subject)}`)
  }

  const toggleFAQ = async (index: number) => {
    haptics.tap()
    setExpandedFAQ(expandedFAQ === index ? null : index)
  }



  const faqItems = [
    {
      question: 'How do I send money?',
      answer: 'To send money, tap the "Send Money" button on your dashboard, enter the amount and select currencies, choose a recipient, make payment using the displayed method, and confirm your transaction.'
    },
    {
      question: 'What are the fees?',
      answer: 'We charge absolutely no fees on any transaction. Send money worldwide completely free with Easner.'
    },
    {
      question: 'How long does it take?',
      answer: 'All transactions are completed within 5 minutes or less, ensuring your money reaches its destination quickly and efficiently.'
    }
  ]

  const renderFAQItem = (item: { question: string; answer: string }, index: number) => {
    const isLast = index === faqItems.length - 1
    return (
      <View key={index} style={[styles.faqItem, isLast && styles.faqItemLast]}>
        <Pressable 
         android_ripple={ripple.neutral} 
          style={styles.faqHeader}
          onPress={() => toggleFAQ(index)}
        >
        <Text style={styles.faqQuestion}>{item.question}</Text>
          <Text style={styles.faqToggle}>{expandedFAQ === index ? '−' : '+'}</Text>
        </Pressable>
        {expandedFAQ === index && (
        <Text style={styles.faqAnswer}>{item.answer}</Text>
        )}
      </View>
    )
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
      onPress={async () => {
        haptics.tap()
        onPress()
      }} >
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
        <ScrollView
          style={styles.scrollContainer}
          contentContainerStyle={{ paddingBottom: insets.bottom + spacing[5] }}
          showsVerticalScrollIndicator={false}
        >
          {/* Premium Header - Matching Send Flow */}
          <Animated.View
            style={[
              styles.header,
              {
                opacity: headerAnim,
                transform: [{
                  translateY: headerAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [-motion.screenEnterTranslateY, 0],
                  })
                }]
              }
            ]}
          >
            <Pressable
             android_ripple={ripple.neutral}
              onPress={async () => {
                haptics.tap()
                navigation.goBack()
              }}
              style={styles.backButton} >
              <ArrowLeft size={24} color={colors.primary.main} strokeWidth={2} />
        </Pressable>
            <View style={styles.headerContent}>
              <Text style={styles.title}>Support</Text>
            </View>
          </Animated.View>

          <Animated.View
            style={[
              styles.content,
              {
                opacity: contentAnim,
                transform: [{
                  translateY: contentAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [motion.screenEnterTranslateY, 0],
                  })
                }]
              }
            ]}
          >
      {/* Contact Options */}
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

      {/* FAQ Section */}
            <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>Frequently Asked Questions</Text>
        {faqItems.map(renderFAQItem)}
            </View>

      {/* Support Hours */}
            <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>Support Hours</Text>
        <View style={styles.hoursContainer}>
          <Text style={styles.hoursText}>All week from 8 am to 11pm GMT+3</Text>
        </View>
            </View>
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
  sectionCard: {
    ...surfaceFrameStyle(colors),
    marginBottom: spacing[4],
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
  inputContainer: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text.secondary,
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border.default,
    borderRadius: borderRadius.full,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 13,
    minHeight: 48,
    lineHeight: 18,
    textAlignVertical: 'center',
    ...Platform.select({
      android: {
        includeFontPadding: false,
      },
    }),
    backgroundColor: colors.background.primary,
  },
  textArea: {
    height: 100,
    lineHeight: 22,
    textAlignVertical: 'top',
    ...Platform.select({
      android: {
        includeFontPadding: false,
      },
    }),
  },
  sendButton: {
    backgroundColor: colors.primary.main,
    borderRadius: borderRadius.full,
    padding: 16,
    alignItems: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: colors.text.tertiary,
  },
  sendButtonText: {
    color: colors.neutral.white,
    fontSize: 16,
    fontWeight: '600',
  },
  faqItem: {
    borderBottomWidth: 1,
    borderBottomColor: colors.frame.border,
    paddingHorizontal: spacing[5],
  },
  faqItemLast: {
    borderBottomWidth: 0,
  },
  faqHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing[4],
  },
  faqQuestion: {
    ...textStyles.bodyMedium,
    fontFamily: fontFamily.medium,
    color: colors.text.primary,
    flex: 1,
    paddingRight: spacing[4],
  },
  faqToggle: {
    fontSize: 20,
    color: colors.text.secondary,
    fontWeight: '300',
  },
  faqAnswer: {
    ...textStyles.bodySmall,
    color: colors.text.secondary,
    lineHeight: 20,
    paddingBottom: spacing[4],
    paddingLeft: spacing[5],
    paddingRight: spacing[5],
  },
  hoursContainer: {
    paddingHorizontal: spacing[5],
    paddingBottom: spacing[2],
  },
  hoursText: {
    ...textStyles.bodyMedium,
    color: colors.text.primary,
    fontFamily: fontFamily.regular,
  },
  timezoneText: {
    fontSize: 12,
    color: colors.text.tertiary,
    fontStyle: 'italic',
  },
  emergencyContainer: {
    backgroundColor: colors.error.background,
    padding: 16,
    borderRadius: 8,
    borderLeftWidth: 4,
    borderLeftColor: colors.error.main,
  },
  emergencyText: {
    fontSize: 14,
    color: colors.error.light,
    marginBottom: 12,
    lineHeight: 20,
  },
  emergencyButton: {
    backgroundColor: colors.error.main,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  emergencyButtonText: {
    color: colors.neutral.white,
    fontSize: 16,
    fontWeight: '600',
  },
})

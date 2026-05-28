import React, { useState, useRef } from 'react'
import {
  View,
  Text,
  StyleSheet,
  Pressable, Platform,
  ActivityIndicator,
  Animated,
} from 'react-native'
import { ArrowLeft, Link as LinkIcon } from 'lucide-react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import ScreenWrapper from '../../components/ScreenWrapper'
import { NavigationProps } from '../../types'
import { colors, shadows, surfaceChromeCircleStyle, textStyles, borderRadius, spacing, motion, fontFamily } from '../../theme'
import { useCalmParallelEnterWhen } from '../../hooks/useCalmParallelEnter'
import SkeletonLoader from '../../components/SkeletonLoader'
import { PlainTwoColumnRowSkeleton } from '../../components/skeletons'
import { useDeferredLoading } from '../../hooks/useDeferredLoading'
import { ripple } from '../../lib/androidRipple'
import { useToast } from '../../components/ToastProvider'
import { completeManualSendOrder } from '../../hooks/use-manual-pay-in-screen'
import { ManualSendReceiptUpload } from '../../components/send/ManualSendReceiptUpload'
import type { ManualQuoteResponse } from '../../lib/manual-send-api'
import { haptics } from '../../lib/haptics'

export default function OpenBankingScreen({ navigation, route }: NavigationProps) {
  const insets = useSafeAreaInsets()
  const { showError } = useToast()
  const [loading, setLoading] = useState(false)
  const showLoadingSpinner = useDeferredLoading(loading)
  const [receiptPath, setReceiptPath] = useState<string | null>(null)
  
  const {
    transactionId,
    sendCurrency,
    paymentMethod,
    paymentMethodId,
    recipient,
    manualQuote,
  } = (route.params || {}) as {
    transactionId?: string
    sendCurrency?: string
    paymentMethod?: string
    paymentMethodId?: string
    recipient?: { id?: string }
    manualQuote?: ManualQuoteResponse | null
  }
  
  // Determine if this is SBP (Russian Faster Payments System)
  const isSBP = paymentMethod === 'sbp' || sendCurrency === 'RUB'

  // Animation refs
  const headerAnim = useRef(new Animated.Value(0)).current
  const contentAnim = useRef(new Animated.Value(0)).current

  useCalmParallelEnterWhen(true, headerAnim, contentAnim)

  const handleConnect = async () => {
    setLoading(true)
    haptics.medium()
    
    // TODO: Integrate Plaid/OpenBanking flow here
    // For now, simulate connection
    setTimeout(() => {
      void (async () => {
        try {
          let txId = transactionId
          if (paymentMethodId && recipient?.id && manualQuote) {
            const created = await completeManualSendOrder({
              recipientId: recipient.id,
              paymentMethodId,
              manualQuote,
              referenceCode: transactionId,
              receiptUrl: receiptPath,
            })
            txId = created.transactionId
          }
          setLoading(false)
          navigation.replace('TransactionDetails' as never, {
            transactionId: txId,
            fromScreen: 'SendFlow',
          } as never)
        } catch (e) {
          setLoading(false)
          showError(e instanceof Error ? e.message : 'Failed to submit payment')
        }
      })()
    }, 2000)
  }

  return (
    <ScreenWrapper>
      <View style={styles.container}>
        {/* Header */}
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
            onPress={() => navigation.goBack()}
            style={styles.backButton}
          >
            <ArrowLeft size={24} color={colors.primary.main} strokeWidth={2} />
          </Pressable>
          <View style={styles.headerContent}>
            <Text style={styles.title}>
              {isSBP ? 'Connect via SBP' : 'Link Bank Account'}
            </Text>
          </View>
        </Animated.View>

        {/* Content */}
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
          <View style={styles.infoContainer}>
            <View style={styles.iconContainer}>
              <LinkIcon size={48} color={colors.primary.main} strokeWidth={2} />
            </View>
            <Text style={styles.infoTitle}>
              {isSBP ? 'Connect via Faster Payments System' : 'Connect Your Bank'}
            </Text>
            <Text style={styles.infoText}>
              {isSBP 
                ? 'Securely connect your Russian bank account via SBP (Faster Payments System) to complete this payment. We use bank-level encryption to keep your information safe.'
                : 'Securely connect your bank account to complete this payment. We use bank-level encryption to keep your information safe.'}
            </Text>
          </View>

          {paymentMethodId && transactionId ? (
            <ManualSendReceiptUpload
              referenceCode={transactionId}
              onPathChange={setReceiptPath}
              disabled={loading}
            />
          ) : null}

          {showLoadingSpinner ? (
            <View style={styles.loadingContainer}>
              <PlainTwoColumnRowSkeleton variant="plain" showDivider={false} />
              <SkeletonLoader width="100%" height={48} borderRadius={borderRadius.lg} style={{ marginTop: spacing[4] }} />
              <Text style={styles.loadingText}>
                {isSBP ? 'Connecting to SBP...' : 'Connecting to your bank...'}
              </Text>
            </View>
          ) : (
            <Pressable
             android_ripple={ripple.neutral}
              style={styles.connectButton}
              onPress={handleConnect} >
              <LinearGradient
                colors={colors.primary.gradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.connectButtonGradient}
              >
                <Text style={styles.connectButtonText}>
                  {isSBP ? 'Connect via SBP' : 'Connect Bank Account'}
                </Text>
              </LinearGradient>
            </Pressable>
          )}
        </Animated.View>
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
    marginBottom: 2,
  },
  content: {
    flex: 1,
    paddingHorizontal: spacing[5],
    paddingTop: spacing[6],
  },
  infoContainer: {
    alignItems: 'center',
    marginBottom: spacing[8],
  },
  iconContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: colors.primary.main + '10',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing[4],
  },
  infoTitle: {
    ...textStyles.headlineSmall,
    color: colors.text.primary,
    fontFamily: fontFamily.semibold,
    marginBottom: spacing[2],
    textAlign: 'center',
  },
  infoText: {
    ...textStyles.bodyLarge,
    color: colors.text.secondary,
    fontFamily: fontFamily.regular,
    textAlign: 'center',
    lineHeight: 24,
  },
  loadingContainer: {
    alignItems: 'center',
    marginTop: spacing[8],
  },
  loadingText: {
    ...textStyles.bodyMedium,
    color: colors.text.secondary,
    fontFamily: fontFamily.regular,
    marginTop: spacing[3],
  },
  connectButton: {
    borderRadius: borderRadius.full,
    overflow: 'hidden',
    marginTop: 'auto',
    marginBottom: spacing[4],
  },
  connectButtonGradient: {
    paddingVertical: spacing[4],
    alignItems: 'center',
    justifyContent: 'center',
  },
  connectButtonText: {
    ...textStyles.titleLarge,
    color: colors.text.inverse,
    fontFamily: fontFamily.semibold,
  },
})


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
import * as Haptics from 'expo-haptics'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import ScreenWrapper from '../../components/ScreenWrapper'
import { NavigationProps } from '../../types'
import { colors, shadows, surfaceChromeCircleStyle, textStyles, borderRadius, spacing, motion, fontFamily } from '../../theme'
import { useCalmParallelEnterWhen } from '../../hooks/useCalmParallelEnter'
import { ripple } from '../../lib/androidRipple'

export default function OpenBankingScreen({ navigation, route }: NavigationProps) {
  const insets = useSafeAreaInsets()
  const [loading, setLoading] = useState(false)
  
  const { transactionId, sendAmount, receiveAmount, sendCurrency, receiveCurrency, recipient, paymentMethod } = route.params || {}
  
  // Determine if this is SBP (Russian Faster Payments System)
  const isSBP = paymentMethod === 'sbp' || sendCurrency === 'RUB'

  // Animation refs
  const headerAnim = useRef(new Animated.Value(0)).current
  const contentAnim = useRef(new Animated.Value(0)).current

  useCalmParallelEnterWhen(true, headerAnim, contentAnim)

  const handleConnect = async () => {
    setLoading(true)
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
    
    // TODO: Integrate Plaid/OpenBanking flow here
    // For now, simulate connection
    setTimeout(() => {
      setLoading(false)
      // After successful connection, navigate to transaction tracking
      navigation.replace('TransactionDetails' as never, {
        transactionId: transactionId,
        fromScreen: 'SendFlow',
      } as never)
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

          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={colors.primary.main} />
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
    borderRadius: borderRadius.xl,
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


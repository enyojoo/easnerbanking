import React, { useEffect, useState, useRef } from 'react'
import {
  View,
  Text,
  Image,
  StyleSheet,
  Pressable,
  Platform,
  ScrollView,
  NativeScrollEvent,
  NativeSyntheticEvent,
  useWindowDimensions,
  Alert,
} from 'react-native'
import { StatusBar } from 'expo-status-bar'
import { LinearGradient } from 'expo-linear-gradient'
import * as Haptics from 'expo-haptics'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { NavigationProps } from '../../types'
import { colors, textStyles, borderRadius, spacing, fontSize, fontFamily, lineHeight } from '../../theme'
import { ripple } from '../../lib/androidRipple'
import { AUTH_INITIAL_MODE_KEY } from '../../constants/auth'

// Onboarding images
const ONBOARDING_DATA = [
  {
    id: 1,
    title: 'A Global\nMoney App',
    image: require('../../../assets/onboarding/onboarding-step1.png'),
  },
  {
    id: 2,
    title: 'Send Money\nLike SMS',
    image: require('../../../assets/onboarding/onboarding-step2.png'),
  },
  {
    id: 3,
    title: 'Spend with\nYour Card',
    image: require('../../../assets/onboarding/onboarding-step3.png'),
  },
]

const ONBOARDING_COMPLETED_KEY = '@easner_onboarding_completed'
const ACCOUNT_DELETED_FLAG_KEY = '@easner_account_deleted'

export default function OnboardingScreen({ navigation }: NavigationProps) {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions()
  const [currentIndex, setCurrentIndex] = useState(0)
  const scrollViewRef = useRef<ScrollView>(null)
  const insets = useSafeAreaInsets()

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const flag = await AsyncStorage.getItem(ACCOUNT_DELETED_FLAG_KEY)
        if (cancelled) return
        if (flag === '1') {
          await AsyncStorage.removeItem(ACCOUNT_DELETED_FLAG_KEY).catch(() => undefined)
          Alert.alert(
            'Account deleted',
            "We're sorry to see you go, come back again.\n\nIf you have any questions, email us: support@easner.com",
            [{ text: 'OK' }],
          )
        }
      } catch {
        // ignore
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  /** Only sync index when paging settles — `onScroll` + Math.round caused label/dot flicker mid-animation. */
  const handleMomentumScrollEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const scrollPosition = event.nativeEvent.contentOffset.x
    const index = Math.round(scrollPosition / screenWidth)
    const clamped = Math.max(0, Math.min(ONBOARDING_DATA.length - 1, index))
    setCurrentIndex((prev) => {
      if (clamped !== prev) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
      }
      return clamped
    })
  }

  const handleNext = async () => {
    if (currentIndex < ONBOARDING_DATA.length - 1) {
      const nextIndex = currentIndex + 1
      scrollViewRef.current?.scrollTo({
        x: nextIndex * screenWidth,
        animated: true,
      })
      setCurrentIndex(nextIndex)
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
    } else {
      await handleGetStarted()
    }
  }

  const handleSkip = async () => {
    await handleGetStarted()
  }

  const handleGetStarted = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
    try {
      await AsyncStorage.setItem(ONBOARDING_COMPLETED_KEY, 'true')
      // Mark that user is coming from onboarding to show back arrow on auth screen
      await AsyncStorage.setItem('@easner_from_onboarding', 'true')
      await AsyncStorage.setItem(AUTH_INITIAL_MODE_KEY, 'signup')
      // Small delay to ensure AsyncStorage is saved before AppNavigator re-checks
      setTimeout(() => {
        // AppNavigator will automatically switch to AuthStack
      }, 100)
    } catch (error) {
      console.error('Error saving onboarding status:', error)
    }
  }

  const goToSlide = (index: number) => {
    scrollViewRef.current?.scrollTo({
      x: index * screenWidth,
      animated: true,
    })
    setCurrentIndex(index)
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
  }

  return (
    <View style={styles.screen}>
      <StatusBar style="light" />
      <View style={styles.container}>
        {/* Progress Dots - Top */}
        <View style={[styles.pagination, { paddingTop: insets.top + spacing[4] }]}>
          {ONBOARDING_DATA.map((_, index) => (
            <Pressable
             android_ripple={ripple.neutral}
              key={index}
              style={[
                styles.dot,
                currentIndex === index && styles.dotActive,
              ]}
              onPress={() => goToSlide(index)} />
          ))}
        </View>

        {/* Scrollable Content */}
        <ScrollView
          ref={scrollViewRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={handleMomentumScrollEnd}
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
        >
          {ONBOARDING_DATA.map((item) => (
            <View key={item.id} style={[styles.slide, { width: screenWidth }]}>
              {/* Title */}
              <View style={styles.titleContainer}>
                <Text style={styles.title}>{item.title}</Text>
              </View>

              {/* App Mockup Image */}
              <View style={styles.imageWrapper}>
                <Image
                  source={item.image}
                  style={[styles.image, { maxWidth: screenWidth }]}
                  resizeMode="contain"
                />
              </View>
            </View>
          ))}
        </ScrollView>

        {/* Dark Fade Overlay from Bottom of Screen */}
        <LinearGradient
          colors={['transparent', 'rgba(0, 0, 0, 0.1)', 'rgba(0, 0, 0, 0.4)', 'rgba(0, 0, 0, 0.75)', 'rgba(0, 0, 0, 0.95)', '#000000', '#000000']}
          locations={[0, 0.2, 0.4, 0.6, 0.8, 0.9, 1]}
          style={[styles.fadeOverlay, { height: screenHeight * 0.7 }]}
          pointerEvents="none"
        />

        {/* Action Buttons on Dark Fade Area */}
        <View style={[styles.bottomActions, { paddingBottom: Math.max(insets.bottom, spacing[6]) }]}>
          <Pressable
            style={({ pressed }) => [styles.skipButtonBottom, pressed && styles.skipButtonPressed]}
            onPress={handleSkip}
            android_ripple={{ color: 'rgba(255,255,255,0.2)' }}
          >
            <Text style={styles.skipButtonText}>Skip</Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [styles.nextButton, pressed && styles.nextButtonPressed]}
            onPress={handleNext}
            android_ripple={{ color: 'rgba(255,255,255,0.25)' }}
          >
            <View style={styles.nextButtonLabelWrap}>
              <Text style={styles.nextButtonText}>
                {currentIndex === ONBOARDING_DATA.length - 1 ? 'Get Started' : 'Next'}
              </Text>
            </View>
          </Pressable>
        </View>

        {/* Login Link - Bottom */}
        <Pressable
         android_ripple={ripple.neutral}
          style={[styles.loginLink, { paddingBottom: Math.max(insets.bottom, spacing[4]) }]}
          onPress={async () => {
            await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
            try {
              // Mark onboarding as completed
            await AsyncStorage.setItem(ONBOARDING_COMPLETED_KEY, 'true')
              // Mark that user is coming from onboarding to show back arrow on auth screen
              await AsyncStorage.setItem('@easner_from_onboarding', 'true')
              // Small delay to ensure AsyncStorage is saved before AppNavigator re-checks
              setTimeout(() => {
                // AppNavigator will automatically switch to AuthStack
              }, 100)
            } catch (error) {
              console.error('Error navigating to login:', error)
            }
          }} >
          <Text style={styles.loginText}>
            Already have an account? <Text style={styles.loginLinkText}>Log In</Text>
          </Text>
        </Pressable>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.neutral.black,
  },
  container: {
    flex: 1,
  },
  pagination: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing[5],
    paddingBottom: spacing[4],
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    marginHorizontal: spacing[1],
  },
  dotActive: {
    width: 32,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.text.inverse,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    alignItems: 'center',
  },
  slide: {
    width: '100%',
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingHorizontal: spacing[5],
  },
  titleContainer: {
    width: '100%',
    alignItems: 'center',
    paddingTop: spacing[6],
    paddingBottom: spacing[4],
  },
  title: {
    /** Hero headline — between `fontSize['4xl']` and `5xl` for marketing slides */
    fontSize: fontSize['4xl'] + 2,
    lineHeight: (fontSize['4xl'] + 2) * lineHeight.tight,
    color: colors.text.inverse,
    textAlign: 'center',
    fontFamily: fontFamily.bold,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  imageWrapper: {
    flex: 1,
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: spacing[2],
  },
  image: {
    width: '100%',
    height: '100%',
    maxWidth: '100%',
  },
  fadeOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '70%',
    zIndex: 1,
  },
  bottomActions: {
    position: 'absolute',
    bottom: spacing[20],
    left: 0,
    right: 0,
    flexDirection: 'row',
    paddingHorizontal: spacing[5],
    gap: spacing[3],
    zIndex: 2,
  },
  skipButtonBottom: {
    flex: 1,
    overflow: 'hidden',
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderRadius: borderRadius['3xl'],
    paddingVertical: spacing[4],
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 56,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  skipButtonPressed: {
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
  },
  skipButtonText: {
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.md,
    lineHeight: fontSize.md * lineHeight.snug,
    color: colors.text.inverse,
    fontWeight: '600',
  },
  nextButton: {
    flex: 1,
    overflow: 'hidden',
    backgroundColor: colors.primary.main,
    borderRadius: borderRadius['3xl'],
    paddingVertical: spacing[4],
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 56,
  },
  nextButtonPressed: {
    backgroundColor: colors.primary.dark,
  },
  /** Avoid width jump when label switches between “Next” and “Get Started”. */
  nextButtonLabelWrap: {
    minWidth: 128,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nextButtonText: {
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.md,
    lineHeight: fontSize.md * lineHeight.snug,
    color: colors.text.inverse,
    fontWeight: '600',
  },
  loginLink: {
    alignItems: 'center',
    paddingTop: spacing[2],
    paddingHorizontal: spacing[5],
    zIndex: 3,
  },
  loginText: {
    ...textStyles.bodySmall,
    color: colors.text.inverse,
    fontFamily: fontFamily.regular,
    opacity: 0.9,
  },
  loginLinkText: {
    ...textStyles.bodySmall,
    color: colors.text.inverse,
    textDecorationLine: 'underline',
    fontWeight: '600',
    fontFamily: fontFamily.semibold,
  },
})

import React, { useState, useEffect, useCallback } from 'react'
import { View, Platform, Text, AppState, AppStateStatus, StyleSheet } from 'react-native'
import { createStackNavigator } from '@react-navigation/stack'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { useNavigation } from '@react-navigation/native'
import { Ionicons } from '@expo/vector-icons'
import { House, CreditCard, ChartSpline, Grip } from 'lucide-react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useAuth } from '../contexts/AuthContext'
import { useThemeColors, shadows, borderRadius, spacing, layout } from '../theme'
import {
  isPinSetup,
  evaluateIdleLock,
  isAppLocked,
  dismissPinPrompt,
  applyColdStartPinLockIfNeeded,
  markSessionInteraction,
} from '../lib/pinAuth'
import { emitAppLocked, registerAppLockListener } from '../lib/app-lock-bus'
import { useBusinessNoahSync } from '../hooks/useBusinessNoahSync'
import { useConsumerKycNoahSync } from '../hooks/useConsumerKycNoahSync'
// Stack timing and Android vs iOS card transitions: see `transitionPresets.ts`.
import {
  mainStackPreset,
  sendFlowStandardPreset,
  sendFlowInstantTransitionSpec,
} from './transitionPresets'

// Onboarding Screen
import OnboardingScreen from '../screens/onboarding/OnboardingScreen'

// Auth Screens
import AuthScreen from '../screens/auth/AuthScreen'
import ForgotPasswordScreen from '../screens/auth/ForgotPasswordScreen'
import ResetPasswordScreen from '../screens/auth/ResetPasswordScreen'
import PinSetupScreen from '../screens/auth/PinSetupScreen'
import PinEntryScreen from '../screens/auth/PinEntryScreen'
import MfaVerifyScreen from '../screens/auth/MfaVerifyScreen'

// Components
import PinSetupPrompt from '../components/PinSetupPrompt'

// Main Screens
import DashboardScreen from '../screens/main/DashboardScreen'
import RecipientsScreen from '../screens/main/RecipientsScreen'
import TransactionsScreen from '../screens/main/TransactionsScreen'
import MoreScreen from '../screens/main/MoreScreen'
import OpenCurrencyAccountScreen from '../screens/main/OpenCurrencyAccountScreen'
import ProfileEditScreen from '../screens/main/ProfileEditScreen'
import SupportScreen from '../screens/main/SupportScreen'
import CardScreen from '../screens/main/CardScreen'
import TransactionCardScreen from '../screens/main/TransactionCardScreen'
import ChangePasswordScreen from '../screens/main/ChangePasswordScreen'
import ChangePinScreen from '../screens/main/ChangePinScreen'
import MfaSetupScreen from '../screens/main/MfaSetupScreen'
import NotificationsScreen from '../screens/main/NotificationsScreen'
import InAppNotificationsScreen from '../screens/main/InAppNotificationsScreen'

// Transaction Screens
import TransactionDetailsScreen from '../screens/transactions/TransactionDetailsScreen'
import LegacyTransactionDetailsScreen from '../screens/transactions/LegacyTransactionDetailsScreen'

// Send Money Flow Screens
import SendAmountScreen from '../screens/send/SendAmountScreen'
import SelectRecentRecipientScreen from '../screens/send/SelectRecentRecipientScreen'
import SelectRecipientScreen from '../screens/send/SelectRecipientScreen'
import PaymentMethodScreen from '../screens/send/PaymentMethodScreen'
import ConfirmationScreen from '../screens/send/ConfirmationScreen'
import SendTransactionDetailsScreen from '../screens/send/SendTransactionDetailsScreen'
import OpenBankingScreen from '../screens/send/OpenBankingScreen'
import VirtualBankAccountScreen from '../screens/send/VirtualBankAccountScreen'
import MobileMoneyScreen from '../screens/send/MobileMoneyScreen'

// Receive Money Flow Screens
import ReceiveMoneyScreen from '../screens/receive/ReceiveMoneyScreen'
import ReceiveTransactionDetailsScreen from '../screens/receive/ReceiveTransactionDetailsScreen'

// Verification Screens
import AccountVerificationScreen from '../screens/verification/AccountVerificationScreen'

const Stack = createStackNavigator()
const Tab = createBottomTabNavigator()

function OnboardingStack() {
  return (
    <Stack.Navigator 
      screenOptions={{ 
        headerShown: false,
        gestureEnabled: false,
      }}
    >
      <Stack.Screen 
        name="Onboarding" 
        component={OnboardingScreen}
      />
    </Stack.Navigator>
  )
}

function MfaStack() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        ...mainStackPreset(),
      }}
    >
      <Stack.Screen name="MfaVerify" component={MfaVerifyScreen} />
    </Stack.Navigator>
  )
}

function AuthStack() {
  return (
    <Stack.Navigator 
      screenOptions={{ 
        headerShown: false,
        ...mainStackPreset()
      }}
    >
      <Stack.Screen 
        name="Auth" 
        component={AuthScreen}
        options={{
          gestureEnabled: true, // Allow swipe back when coming from onboarding
        }}
      />
      <Stack.Screen 
        name="ForgotPassword" 
        component={ForgotPasswordScreen}
        options={{
          ...mainStackPreset(),
        }}
      />
      <Stack.Screen 
        name="ResetPassword" 
        component={ResetPasswordScreen}
        options={{
          ...mainStackPreset(),
        }}
      />
      <Stack.Screen 
        name="PinSetup" 
        component={PinSetupScreen}
        options={{
          ...mainStackPreset(),
        }}
        initialParams={{ mandatory: false }}
      />
      <Stack.Screen 
        name="PinEntry" 
        component={PinEntryScreen}
        options={{
          ...mainStackPreset(),
        }}
      />
    </Stack.Navigator>
  )
}

// Styles for active icon container (circular background highlight)
const tabBarStyles = StyleSheet.create({
  activeIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
})

function MainTabs() {
  const insets = useSafeAreaInsets()
  const palette = useThemeColors()
  useBusinessNoahSync()
  useConsumerKycNoahSync()

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: palette.primary.main,
          borderTopWidth: 0,
          elevation: 4,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: -1 },
          shadowOpacity: 0.12,
          shadowRadius: 6,
          height: layout.tabBarHeight + insets.bottom,
          paddingBottom: insets.bottom,
          paddingTop: spacing[2],
          paddingHorizontal: spacing[2],
          marginHorizontal: 0,
          marginBottom: 0,
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          overflow: 'hidden',
        },
        tabBarShowLabel: false,
        tabBarActiveTintColor: palette.text.inverse,
        tabBarInactiveTintColor: 'rgba(255, 255, 255, 0.55)',
        tabBarItemStyle: {
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          paddingHorizontal: 10,
        },
        tabBarIconStyle: {
          marginTop: spacing[1],
        },
      }}
    >
      <Tab.Screen 
        name="Dashboard" 
        component={DashboardScreen}
        options={{
          tabBarIcon: ({ focused, color }) => (
            <View style={focused ? tabBarStyles.activeIconContainer : null}>
              <House 
                size={26} 
                color={focused ? palette.text.inverse : 'rgba(255, 255, 255, 0.55)'}
                strokeWidth={focused ? 2.5 : 2}
              />
            </View>
          ),
        }}
      />
      <Tab.Screen 
        name="Card" 
        component={CardScreen}
        options={{
          tabBarIcon: ({ focused, color }) => (
            <View style={focused ? tabBarStyles.activeIconContainer : null}>
              <CreditCard 
                size={26} 
                color={focused ? palette.text.inverse : 'rgba(255, 255, 255, 0.55)'}
                strokeWidth={focused ? 2.5 : 2}
              />
            </View>
          ),
        }}
      />
      <Tab.Screen 
        name="Transactions" 
        component={TransactionsScreen}
        options={{
          tabBarIcon: ({ focused, color }) => (
            <View style={focused ? tabBarStyles.activeIconContainer : null}>
              <ChartSpline 
                size={26} 
                color={focused ? palette.text.inverse : 'rgba(255, 255, 255, 0.55)'}
                strokeWidth={focused ? 2.5 : 2}
              />
            </View>
          ),
        }}
      />
      <Tab.Screen 
        name="More" 
        component={MoreScreen}
        options={{
          tabBarIcon: ({ focused, color }) => (
            <View style={focused ? tabBarStyles.activeIconContainer : null}>
              <Grip 
                size={26} 
                color={focused ? palette.text.inverse : 'rgba(255, 255, 255, 0.55)'}
                strokeWidth={focused ? 2.5 : 2}
              />
            </View>
          ),
        }}
      />
    </Tab.Navigator>
  )
}

function MainStackWithPinPrompt({ showPinPrompt }: { showPinPrompt: boolean }) {
  const [pinPromptVisible, setPinPromptVisible] = React.useState(false)
  const navigation = useNavigation()

  React.useEffect(() => {
    if (showPinPrompt) {
      // Small delay to ensure main app is loaded
      const timer = setTimeout(() => {
        setPinPromptVisible(true)
      }, 500)
      return () => clearTimeout(timer)
    } else {
      // Hide prompt if showPinPrompt becomes false
      setPinPromptVisible(false)
    }
  }, [showPinPrompt])

  const handlePinSetup = () => {
    setPinPromptVisible(false)
    // Navigate to PIN setup screen (in AuthStack)
    navigation.navigate('PinSetup' as never)
  }

  const handleDismissPinPrompt = async () => {
    await dismissPinPrompt()
    setPinPromptVisible(false)
  }

  return (
    <>
      <MainStack />
      <PinSetupPrompt
        visible={pinPromptVisible}
        onSetup={handlePinSetup}
        onDismiss={handleDismissPinPrompt}
      />
    </>
  )
}

function MainStack() {
  return (
    <View
      style={{ flex: 1 }}
      collapsable={false}
      onStartShouldSetResponderCapture={() => {
        markSessionInteraction()
        return false
      }}
    >
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        ...mainStackPreset()
      }}
    >
      <Stack.Screen 
        name="MainTabs" 
        component={MainTabs} 
        options={{ 
          headerShown: false,
          gestureEnabled: false // Disable gesture for main tabs
        }}
      />
      <Stack.Screen 
        name="PinSetup" 
        component={PinSetupScreen}
        options={{
          ...mainStackPreset(),
        }}
      />
      <Stack.Screen 
        name="SelectRecentRecipient" 
        component={SelectRecentRecipientScreen}
        options={({ navigation }) => {
          // Check if previous screen is SendAmountScreen (no transition when going back from SendAmountScreen)
          const state = navigation.getState()
          const currentIndex = state?.index ?? 0
          const previousRoute = currentIndex > 0 ? state?.routes?.[currentIndex - 1] : null
          const isFromSendAmount = previousRoute?.name === 'SendAmount'
          
          return {
            headerShown: false,
            ...(Platform.OS === 'ios' ? { fullScreenGestureEnabled: true as const } : {}),
            // No animation when going back from SendAmountScreen
            ...(isFromSendAmount ? sendFlowInstantTransitionSpec : sendFlowStandardPreset()),
          }
        }}
      />
      <Stack.Screen 
        name="SendAmount" 
        component={SendAmountScreen}
        options={({ navigation, route }) => {
          // Check route params for flags (forward navigation)
          const params = route.params as any
          const fromSelectRecipientParam = params?.fromSelectRecipient === true
          const fromSelectRecentRecipientParam = params?.fromSelectRecentRecipient === true
          
          // Check if previous screen is the send recipient hub (backward navigation)
          const state = navigation.getState()
          const currentIndex = state?.index ?? 0
          const previousRoute = currentIndex > 0 ? state?.routes?.[currentIndex - 1] : null
          const isFromSelectRecent = previousRoute?.name === 'SelectRecentRecipient'
          const isFromRecipientScreen =
            isFromSelectRecent || fromSelectRecipientParam || fromSelectRecentRecipientParam
          
          return {
            headerShown: false,
            ...(Platform.OS === 'ios' ? { fullScreenGestureEnabled: true as const } : {}),
            // No animation when navigating from/to the send recipient hub (same header)
            ...(isFromRecipientScreen ? sendFlowInstantTransitionSpec : sendFlowStandardPreset()),
          }
        }}
      />
      <Stack.Screen 
        name="SelectRecipient" 
        component={SelectRecipientScreen}
        options={({ navigation }) => {
          // Check if previous screen is SendAmountScreen or SelectRecentRecipientScreen (no transition)
          const state = navigation.getState()
          const currentIndex = state?.index ?? 0
          const previousRoute = currentIndex > 0 ? state?.routes?.[currentIndex - 1] : null
          const isFromSendAmount = previousRoute?.name === 'SendAmount'
          const isFromSelectRecent = previousRoute?.name === 'SelectRecentRecipient'
          const shouldHaveNoTransition = isFromSendAmount || isFromSelectRecent
          
          return {
            headerShown: false,
            // No animation when navigating to/from SendAmountScreen or SelectRecentRecipientScreen
            ...(shouldHaveNoTransition ? sendFlowInstantTransitionSpec : sendFlowStandardPreset()),
          }
        }}
      />
      <Stack.Screen 
        name="PaymentMethod" 
        component={PaymentMethodScreen}
        options={{ 
          headerShown: false,
          ...sendFlowStandardPreset(),
        }}
      />
      <Stack.Screen 
        name="Confirmation" 
        component={ConfirmationScreen}
        options={{ 
          headerShown: false,
          ...sendFlowStandardPreset(),
        }}
      />
      <Stack.Screen 
        name="SendTransactionDetails" 
        component={SendTransactionDetailsScreen}
        options={{ 
          headerShown: false,
          ...sendFlowStandardPreset(),
          gestureEnabled: false, // Disable all gestures - only allow navigation via buttons
        }}
      />
      <Stack.Screen 
        name="OpenBanking" 
        component={OpenBankingScreen}
        options={{ 
          headerShown: false,
          ...sendFlowStandardPreset(),
        }}
      />
      <Stack.Screen 
        name="VirtualBankAccount" 
        component={VirtualBankAccountScreen}
        options={{ 
          headerShown: false,
          ...sendFlowStandardPreset(),
        }}
      />
      <Stack.Screen
        name="MobileMoney" 
        component={MobileMoneyScreen}
        options={{ 
          headerShown: false,
          ...sendFlowStandardPreset(),
        }}
      />
      <Stack.Screen 
        name="ReceiveMoney" 
        component={ReceiveMoneyScreen}
        options={{ 
          headerShown: false,
          ...mainStackPreset(),
        }}
      />
      <Stack.Screen
        name="OpenCurrencyAccount"
        component={OpenCurrencyAccountScreen}
        options={{
          headerShown: false,
          ...mainStackPreset(),
        }}
      />
      <Stack.Screen 
        name="TransactionDetails" 
        component={TransactionDetailsScreen}
        options={{ 
          headerShown: false,
          ...mainStackPreset(),
        }}
      />
      <Stack.Screen 
        name="LegacyTransactionDetails" 
        component={LegacyTransactionDetailsScreen}
        options={{ 
          headerShown: false,
          ...mainStackPreset(),
        }}
      />
      <Stack.Screen 
        name="Recipients" 
        component={RecipientsScreen}
        options={{ 
          headerShown: false,
          ...mainStackPreset(),
        }}
      />
      <Stack.Screen 
        name="Card" 
        component={CardScreen}
        options={{ 
          headerShown: false,
          ...mainStackPreset(),
        }}
      />
      <Stack.Screen 
        name="TransactionCard" 
        component={TransactionCardScreen}
        options={{ 
          headerShown: false,
          ...mainStackPreset(),
        }}
      />
      <Stack.Screen 
        name="Support" 
        component={SupportScreen}
        options={{ 
          headerShown: false,
          ...mainStackPreset(),
        }}
      />
      <Stack.Screen 
        name="ReceiveTransactionDetails" 
        component={ReceiveTransactionDetailsScreen}
        options={{ 
          headerShown: false,
          ...mainStackPreset(),
        }}
      />
      <Stack.Screen 
        name="AccountVerification" 
        component={AccountVerificationScreen}
        options={{ 
          headerShown: false,
          ...mainStackPreset(),
        }}
      />
      <Stack.Screen 
        name="ProfileEdit" 
        component={ProfileEditScreen}
        options={{ 
          headerShown: false,
          ...mainStackPreset(),
        }}
      />
      <Stack.Screen 
        name="ChangePassword" 
        component={ChangePasswordScreen}
        options={{ 
          headerShown: false,
          ...mainStackPreset(),
        }}
      />
      <Stack.Screen
        name="ChangePin"
        component={ChangePinScreen}
        options={{
          headerShown: false,
          ...mainStackPreset(),
        }}
      />
      <Stack.Screen
        name="MfaSetup"
        component={MfaSetupScreen}
        options={{
          headerShown: false,
          ...mainStackPreset(),
        }}
      />
      <Stack.Screen 
        name="Notifications" 
        component={NotificationsScreen}
        options={{ 
          headerShown: false,
          ...mainStackPreset(),
        }}
      />
      <Stack.Screen 
        name="InAppNotifications" 
        component={InAppNotificationsScreen}
        options={{ 
          headerShown: false,
          ...mainStackPreset(),
        }}
      />
    </Stack.Navigator>
    </View>
  )
}

const ONBOARDING_COMPLETED_KEY = '@easner_onboarding_completed'

function PinGateSetupStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen
        name="PinSetupGate"
        component={PinSetupScreen}
        initialParams={{ mandatory: true }}
      />
    </Stack.Navigator>
  )
}

function PinGateEntryStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="PinEntryGate" component={PinEntryScreen} />
    </Stack.Navigator>
  )
}

export default function AppNavigator() {
  const { user, userProfile, loading, mfaPending, signOut } = useAuth()
  const [pinGate, setPinGate] = useState<'loading' | 'setup' | 'pin' | 'main'>('loading')
  const [lockTick, setLockTick] = useState(0)
  const [onboardingCompleted, setOnboardingCompleted] = useState<boolean | null>(null)
  // PIN TEMPORARILY DISABLED - keeping state variables for easy re-enable
  // const [pinSetup, setPinSetup] = useState<boolean | null>(null)
  // const [sessionValid, setSessionValid] = useState<boolean | null>(null)
  const [checkingAuth, setCheckingAuth] = useState(true)
  // const [isNewUser, setIsNewUser] = useState<boolean | null>(null)
  // const [showPinPrompt, setShowPinPrompt] = useState(false)
  // const [justLoggedIn, setJustLoggedIn] = useState(false)
  // const [hasActiveSession, setHasActiveSession] = useState(false)
  // const [forceCheck, setForceCheck] = useState(0) // Trigger to force immediate check

  // PIN TEMPORARILY DISABLED
  // Watch for user logout - immediately reset state when user becomes null
  // useEffect(() => {
  //   if (!user) {
  //     setPinSetup(null)
  //     setSessionValid(null)
  //     setIsNewUser(null)
  //     setShowPinPrompt(false)
  //     setJustLoggedIn(false)
  //     setCheckingAuth(false)
  //   }
  // }, [user])

  // PIN TEMPORARILY DISABLED
  // Handle app state changes - clear session when app goes to background
  // useEffect(() => {
  //   const handleAppStateChange = (nextAppState: AppStateStatus) => {
  //     if (nextAppState === 'background' || nextAppState === 'inactive') {
  //       clearSessionActivity()
  //       setSessionValid(false)
  //     }
  //   }
  //   const subscription = AppState.addEventListener('change', handleAppStateChange)
  //   return () => {
  //     subscription?.remove()
  //   }
  // }, [])

  // PIN TEMPORARILY DISABLED - Simplified auth check
  // Check onboarding status on mount - this should happen regardless of user state
  const checkOnboardingState = useCallback(async () => {
    try {
      // Check onboarding status from AsyncStorage
      const onboardingValue = await AsyncStorage.getItem(ONBOARDING_COMPLETED_KEY)
      setOnboardingCompleted(onboardingValue === 'true')
      setCheckingAuth(false)
    } catch (error) {
      console.error('Error checking onboarding state:', error)
      setCheckingAuth(false)
      // Default to false if there's an error, so onboarding shows
      setOnboardingCompleted(false)
    }
  }, []) // No dependencies - only uses stable state setters

  useEffect(() => {
    // Check onboarding status on mount
    checkOnboardingState()
  }, [checkOnboardingState]) // Run on mount and when function changes

  useEffect(() => {
    return registerAppLockListener((event) => {
      if (event === 'unlocked') {
        setPinGate('main')
      } else if (event === 'locked') {
        setPinGate('pin')
      }
      setLockTick((t) => t + 1)
    })
  }, [])

  useEffect(() => {
    if (!user) {
      setPinGate('loading')
    }
  }, [user])

  useEffect(() => {
    if (!user?.id || loading || mfaPending) return
    let cancelled = false
    void (async () => {
      const setup = await isPinSetup(user.id)
      if (cancelled) return
      if (!setup) {
        setPinGate('setup')
        return
      }
      await applyColdStartPinLockIfNeeded(user.id)
      if (cancelled) return
      const idle = await evaluateIdleLock(user.id)
      if (cancelled) return
      if (idle === 'signed_out') {
        await signOut()
        return
      }
      const locked = await isAppLocked(user.id)
      if (locked) {
        setPinGate('pin')
        return
      }
      setPinGate('main')
    })()
    return () => {
      cancelled = true
    }
  }, [user?.id, loading, mfaPending, lockTick, signOut])

  useEffect(() => {
    if (!user?.id || pinGate !== 'main') return
    const id = setInterval(async () => {
      const r = await evaluateIdleLock(user.id)
      if (r === 'signed_out') {
        await signOut()
        return
      }
      if (r === 'locked') emitAppLocked('locked')
    }, 30000)
    return () => clearInterval(id)
  }, [user?.id, pinGate, signOut])

  useEffect(() => {
    if (!user?.id || pinGate !== 'main') return
    const handleAppStateChange = async (nextAppState: AppStateStatus) => {
      if (nextAppState !== 'active') return
      const r = await evaluateIdleLock(user.id)
      if (r === 'signed_out') {
        await signOut()
        return
      }
      if (r === 'locked') emitAppLocked('locked')
    }
    const subscription = AppState.addEventListener('change', handleAppStateChange)
    return () => subscription.remove()
  }, [user?.id, pinGate, signOut])
  
  // Re-check onboarding when app comes to foreground (in case it was changed)
  useEffect(() => {
    const handleAppStateChange = async (nextAppState: AppStateStatus) => {
      if (nextAppState === 'active') {
        // Re-check onboarding status when app comes to foreground
        // This ensures we detect if onboarding was completed
        const onboardingValue = await AsyncStorage.getItem(ONBOARDING_COMPLETED_KEY)
        const isCompleted = onboardingValue === 'true'
        // Only update if it changed to avoid unnecessary re-renders
        if (isCompleted !== onboardingCompleted) {
          setOnboardingCompleted(isCompleted)
        }
      }
    }

    const subscription = AppState.addEventListener('change', handleAppStateChange)
    return () => {
      subscription?.remove()
    }
  }, [onboardingCompleted])
  
  // Poll for onboarding completion when showing onboarding screen
  // This ensures we detect when user completes onboarding
  useEffect(() => {
    if (onboardingCompleted === false) {
      // While onboarding is not completed, poll AsyncStorage to detect when it's completed
      const interval = setInterval(async () => {
        try {
          const onboardingValue = await AsyncStorage.getItem(ONBOARDING_COMPLETED_KEY)
          if (onboardingValue === 'true') {
            setOnboardingCompleted(true)
          }
        } catch (error) {
          console.error('Error polling onboarding status:', error)
        }
      }, 500) // Check every 500ms
      
      return () => clearInterval(interval)
    }
  }, [onboardingCompleted])
  
  // Poll for onboarding reset when showing auth screen (user clicked back button)
  // This ensures we detect when user resets onboarding from auth screen
  useEffect(() => {
    if (onboardingCompleted === true && !user) {
      // While showing auth screen and onboarding is completed, poll to detect if it was reset
      const interval = setInterval(async () => {
        try {
          const onboardingValue = await AsyncStorage.getItem(ONBOARDING_COMPLETED_KEY)
          if (onboardingValue !== 'true') {
            // Onboarding was reset, update state to show onboarding again
            setOnboardingCompleted(false)
          }
        } catch (error) {
          console.error('Error polling onboarding status from auth:', error)
        }
      }, 500) // Check every 500ms
      
      return () => clearInterval(interval)
    }
  }, [onboardingCompleted, user])
  
  // Expose function to trigger onboarding re-check (for AuthScreen back button)
  useEffect(() => {
    ;(global as any).triggerOnboardingCheck = () => {
      checkOnboardingState()
    }
    return () => {
      delete (global as any).triggerOnboardingCheck
    }
  }, [checkOnboardingState]) // Update when checkOnboardingState changes
  
  // Re-check onboarding when user logs out (to allow seeing onboarding again if needed)
  useEffect(() => {
    if (!user && onboardingCompleted !== null) {
      // When user logs out, re-check onboarding status
      checkOnboardingState()
    }
  }, [user, checkOnboardingState])
  
  // PIN TEMPORARILY DISABLED - All PIN-related useEffects commented out
  // Fast polling specifically for session validity check after PIN entry
  // useEffect(() => {
  //   if (!pinSetup || sessionValid === true) {
  //     return
  //   }
  //   if (sessionValid !== false) {
  //     return
  //   }
  //   const fastCheckInterval = setInterval(async () => {
  //     const isValid = await isSessionValid()
  //     if (isValid && sessionValid !== true) {
  //       setSessionValid(true)
  //     }
  //   }, 100)
  //   return () => clearInterval(fastCheckInterval)
  // }, [pinSetup, sessionValid])
  
  // Listen for PIN verification to trigger immediate check
  // React.useEffect(() => {
  //   const checkPinVerification = async () => {
  //     if (pinSetup && user && sessionValid === false) {
  //       await new Promise(resolve => setTimeout(resolve, 10))
  //       const isValid = await isSessionValid()
  //       if (isValid) {
  //         setSessionValid(true)
  //       }
  //     }
  //   }
  //   if (forceCheck > 0) {
  //     checkPinVerification()
  //   }
  // }, [forceCheck, pinSetup, user, sessionValid])
  
  // Expose trigger function globally for PIN entry/setup screens
  // React.useEffect(() => {
  //   ;(global as any).triggerPinCheck = () => {
  //     setForceCheck(prev => prev + 1)
  //     if (pinSetup) {
  //       setSessionValid(true)
  //     }
  //     if (!pinSetup) {
  //       setPinSetup(true)
  //       setSessionValid(false)
  //     }
  //   }
  //   return () => {
  //     delete (global as any).triggerPinCheck
  //   }
  // }, [pinSetup])

  // Show loading screen while checking initial onboarding status
  if (onboardingCompleted === null || checkingAuth) {
    return null // Return null instead of loading spinner for faster transition
  }

  // If onboarding not completed, show onboarding screen FIRST (before checking user)
  // This ensures new users see onboarding even if they're not logged in
  if (!onboardingCompleted) {
    return <OnboardingStack />
  }

  // After onboarding is completed, check user authentication
  // If user is logged out, show auth stack
  if (!user) {
    return <AuthStack key="auth-stack-logged-out" />
  }

  /**
   * Signed-in flow order (enforced in AuthContext: MFA gate resolves before `user` is set):
   * 1. Login (email/password)
   * 2. MFA when required (`mfaPending`)
   * 3. App PIN create or unlock (`pinGate`)
   * 4. Main app
   */
  if (user && mfaPending) {
    return <MfaStack key="mfa-stack" />
  }

  if (loading) {
    return null
  }

  if (user && pinGate === 'loading') {
    return null
  }

  if (user && pinGate === 'setup') {
    return <PinGateSetupStack />
  }

  if (user && pinGate === 'pin') {
    return <PinGateEntryStack />
  }

  if (user && pinGate === 'main') {
    return <MainStack />
  }

  if (user) {
    return <MainStack />
  }

  return <AuthStack key="auth-stack-no-user" />
}


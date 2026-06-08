import React, { useState, useEffect, useCallback, useRef } from 'react'
import { View, Platform, AppState, AppStateStatus, StyleSheet, ActivityIndicator } from 'react-native'
import { createStackNavigator } from '@react-navigation/stack'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { useNavigation } from '@react-navigation/native'
import { House, CreditCard, Activity as ActivityIcon, Grip } from 'lucide-react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useAuth } from '../contexts/AuthContext'
import { useThemeColors, spacing, layout, fontFamily } from '../theme'
import {
  isPinSetup,
  isAppLocked,
  dismissPinPrompt,
  markSessionInteraction,
  evaluateIdleLock,
  applyColdStartPinLockIfNeeded,
} from '../lib/pinAuth'
import { flushPendingDeepLinkNavigation } from '../lib/pendingDeepLinkNavigation'
import {
  flushPendingPushNavigation,
  setPushNavMainReady,
} from '../lib/pendingPushNavigation'
import { emitAppLocked, registerAppLockListener } from '../lib/app-lock-bus'
import { prefetchIntercomModule, prepareIntercomMessenger } from '../lib/intercom'
import { avatarImageUri, warmAvatarCacheAsync } from '../lib/avatarCache'
import { useConsumerKycNoahSync } from '../hooks/useConsumerKycNoahSync'
import { haptics } from '../lib/haptics'
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
import LegalScreen from '../screens/main/LegalScreen'

// Transaction Screens
import TransactionDetailsScreen from '../screens/transactions/TransactionDetailsScreen'

// Send Money Flow Screens
import SendAmountScreen from '../screens/send/SendAmountScreen'
import SelectRecentRecipientScreen from '../screens/send/SelectRecentRecipientScreen'
import ScanWalletAddressScreen from '../screens/recipients/ScanWalletAddressScreen'
import SelectRecipientScreen from '../screens/send/SelectRecipientScreen'
import SendConfirmScreen from '../screens/send/SendConfirmScreen'
import SendPinScreen from '../screens/send/SendPinScreen'
import StablecoinScreen from '../screens/send/StablecoinScreen'
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

function MainTabs() {
  const insets = useSafeAreaInsets()
  const palette = useThemeColors()
  useConsumerKycNoahSync()

  const activeColor = palette.primary.main
  const inactiveColor = palette.text.secondary

  return (
    <Tab.Navigator
      screenListeners={{
        tabPress: () => {
          haptics.select()
        },
      }}
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: palette.semantic.card,
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: palette.border.default,
          elevation: 0,
          shadowOpacity: 0,
          shadowOffset: { width: 0, height: 0 },
          shadowRadius: 0,
          height: layout.tabBarHeight + insets.bottom,
          paddingBottom: insets.bottom,
          paddingTop: spacing[1],
          paddingHorizontal: 0,
          margin: 0,
          position: 'relative',
        },
        tabBarShowLabel: true,
        tabBarActiveTintColor: activeColor,
        tabBarInactiveTintColor: inactiveColor,
        tabBarLabelStyle: {
          fontSize: 11,
          fontFamily: fontFamily.medium,
          fontWeight: '500',
          marginTop: 2,
        },
        tabBarItemStyle: {
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          paddingTop: spacing[1],
        },
        tabBarIconStyle: {
          marginBottom: 0,
        },
      }}
    >
      <Tab.Screen
        name="Dashboard"
        component={DashboardScreen}
        options={{
          tabBarLabel: 'Home',
          tabBarIcon: ({ focused }) => (
            <House
              size={22}
              color={focused ? activeColor : inactiveColor}
              strokeWidth={focused ? 2.25 : 1.75}
            />
          ),
        }}
      />
      <Tab.Screen
        name="Card"
        component={CardScreen}
        options={{
          tabBarLabel: 'Cards',
          tabBarIcon: ({ focused }) => (
            <CreditCard
              size={22}
              color={focused ? activeColor : inactiveColor}
              strokeWidth={focused ? 2.25 : 1.75}
            />
          ),
        }}
      />
      <Tab.Screen
        name="Transactions"
        component={TransactionsScreen}
        options={{
          tabBarLabel: 'Transactions',
          tabBarIcon: ({ focused }) => (
            <ActivityIcon
              size={22}
              color={focused ? activeColor : inactiveColor}
              strokeWidth={focused ? 2.25 : 1.75}
            />
          ),
        }}
      />
      <Tab.Screen
        name="More"
        component={MoreScreen}
        options={{
          tabBarLabel: 'More',
          tabBarIcon: ({ focused }) => (
            <Grip
              size={22}
              color={focused ? activeColor : inactiveColor}
              strokeWidth={focused ? 2.25 : 1.75}
            />
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
        name="ScanWalletAddress"
        component={ScanWalletAddressScreen}
        options={{
          headerShown: false,
          animation: 'slide_from_bottom',
          contentStyle: { backgroundColor: '#000' },
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
        name="SendConfirm" 
        component={SendConfirmScreen}
        options={{ 
          headerShown: false,
          ...sendFlowStandardPreset(),
        }}
      />
      <Stack.Screen
        name="SendPin"
        component={SendPinScreen}
        options={{
          headerShown: false,
          ...sendFlowStandardPreset(),
        }}
      />
      <Stack.Screen 
        name="Stablecoin" 
        component={StablecoinScreen}
        options={{ 
          headerShown: false,
          ...sendFlowStandardPreset(),
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
        name="Legal"
        component={LegalScreen}
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
        name="Profile"
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

/** Same canvas as PIN screens — avoids blank frames during auth / PIN / main handoffs. */
function AuthFlowLoadingShell({
  palette,
  testId,
}: {
  palette: ReturnType<typeof useThemeColors>
  testId?: string
}) {
  return (
    <View
      style={[
        StyleSheet.absoluteFill,
        {
          backgroundColor: palette.semantic.background,
          justifyContent: 'center',
          alignItems: 'center',
        },
      ]}
      accessibilityLabel={testId}
    >
      <ActivityIndicator color={palette.primary.main} />
    </View>
  )
}

export default function AppNavigator() {
  const { user, userProfile, loading, mfaPending, mfaGateResolved, signOut } = useAuth()
  const signOutRef = useRef(signOut)
  signOutRef.current = signOut
  const palette = useThemeColors()
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
        prefetchIntercomModule()
        void prepareIntercomMessenger()
      } else if (event === 'locked') {
        const avatarUri = avatarImageUri(userProfile?.profile?.avatar_url)
        if (avatarUri) {
          void warmAvatarCacheAsync(avatarUri)
        }
        setPinGate('pin')
      }
      setLockTick((t) => t + 1)
    })
  }, [userProfile?.profile?.avatar_url])

  useEffect(() => {
    const ready = pinGate === 'main'
    setPushNavMainReady(ready)
    if (ready) {
      const navRef = (global as any).rootNavigationRef?.current
      flushPendingPushNavigation(navRef)
      flushPendingDeepLinkNavigation(navRef)
      prefetchIntercomModule()
      void prepareIntercomMessenger()
    }
  }, [pinGate, lockTick])

  // Warm Intercom while user is on PIN entry so Live Chat is ready right after unlock.
  useEffect(() => {
    if (!user?.id || pinGate !== 'pin') return
    prefetchIntercomModule()
    void prepareIntercomMessenger()
  }, [user?.id, pinGate])

  useEffect(() => {
    if (!user) {
      setPinGate('loading')
    }
  }, [user])

  useEffect(() => {
    // Resolve PIN setup vs entry only after MFA gate is known and not required.
    if (!user?.id || !mfaGateResolved || mfaPending) return
    let cancelled = false
    void (async () => {
      await applyColdStartPinLockIfNeeded(user.id)
      const setup = await isPinSetup(user.id)
      if (cancelled) return
      if (!setup) {
        setPinGate('setup')
        return
      }
      const idle = await evaluateIdleLock(user.id)
      if (cancelled) return
      if (idle === 'signed_out') {
        await signOutRef.current()
        return
      }
      const locked = idle === 'locked' || (await isAppLocked(user.id))
      setPinGate(locked ? 'pin' : 'main')
    })()
    return () => {
      cancelled = true
    }
  }, [user?.id, mfaGateResolved, mfaPending])

  useEffect(() => {
    if (!user?.id || pinGate !== 'main') return
    const id = setInterval(async () => {
      try {
        const r = await evaluateIdleLock(user.id)
        if (r === 'signed_out') {
          await signOut()
          return
        }
        if (r === 'locked') emitAppLocked('locked')
      } catch (e) {
        console.warn('evaluateIdleLock interval failed:', e)
      }
    }, 30000)
    return () => clearInterval(id)
  }, [user?.id, pinGate, signOut])

  useEffect(() => {
    if (!user?.id || pinGate !== 'main') return
    const handleAppStateChange = async (nextAppState: AppStateStatus) => {
      if (nextAppState !== 'active') return
      try {
        const r = await evaluateIdleLock(user.id)
        if (r === 'signed_out') {
          await signOut()
          return
        }
        if (r === 'locked') emitAppLocked('locked')
      } catch (e) {
        console.warn('evaluateIdleLock on active failed:', e)
      }
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

  // Onboarding key read — match app background so the chain onboarding → auth → PIN → main never flashes empty.
  if (onboardingCompleted === null || checkingAuth) {
    return <AuthFlowLoadingShell palette={palette} testId="Bootstrapping app" />
  }

  // If onboarding not completed, show onboarding screen FIRST (before checking user)
  // This ensures new users see onboarding even if they're not logged in
  if (!onboardingCompleted) {
    return <OnboardingStack />
  }

  // After onboarding is completed, check user authentication
  // IMPORTANT: during cold start, Supabase session restore happens asynchronously.
  // While `loading` is true, do NOT flash the Auth stack (login screen) — keep a
  // consistent loading shell until the auth state is resolved.
  if (loading && !user) {
    return <AuthFlowLoadingShell palette={palette} testId="Restoring session" />
  }

  // If user is logged out (and we're not restoring), show auth stack
  if (!user) {
    return <AuthStack key="auth-stack-logged-out" />
  }

  /**
   * Signed-in flow order:
   * 1. Login (email/password)
   * 2. MFA when required (`mfaPending`) — wait until `mfaGateResolved`
   * 3. App PIN create or unlock (`pinGate`)
   * 4. Main app
   */
  if (user && !mfaGateResolved && !mfaPending) {
    return <AuthFlowLoadingShell palette={palette} testId="Checking sign-in security" />
  }

  if (user && mfaPending) {
    return <MfaStack key="mfa-stack" />
  }

  /** Session bootstrap without a user — should be handled above (kept for safety). */
  if (loading && !user) {
    return <AuthFlowLoadingShell palette={palette} testId="Restoring session" />
  }

  if (user && pinGate === 'loading') {
    return <AuthFlowLoadingShell palette={palette} testId="Preparing app" />
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


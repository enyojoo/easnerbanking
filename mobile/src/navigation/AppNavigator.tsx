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
  updateSessionActivity,
  evaluateIdleLock,
  applyColdStartPinLockIfNeeded,
  markWebPinSessionUnlocked,
} from '../lib/pinAuth'
import { flushPendingDeepLinkNavigation } from '../lib/pendingDeepLinkNavigation'
import {
  flushPendingPushNavigation,
  peekPendingPushPayload,
  setPushNavMainReady,
  warmPendingPushTransactionDetail,
} from '../lib/pendingPushNavigation'
import { ACCOUNT_CLOSURE_CANCELLED_KEY } from '../constants/auth'
import { useToast } from '../components/ToastProvider'
import type { PersonalScope } from '@easner/shared'
import { emitAppLocked, registerAppLockListener } from '../lib/app-lock-bus'
import { prefetchIntercomModule, prepareIntercomMessenger } from '../lib/intercom'
import { avatarImageUri, warmAvatarCacheAsync } from '../lib/avatarCache'
import { useConsumerKycNoahSync } from '../hooks/useConsumerKycNoahSync'
import { haptics } from '../lib/haptics'
import { useResponsiveLayout } from '../contexts/ResponsiveLayoutContext'
import { ResponsiveAppShell } from '../components/layout/ResponsiveAppShell'
import { MobileAppLockShell } from '../components/MobileAppLockShell'
import { enterMainAppOnWeb } from './webMainEntry'
import { webStackScreenListeners } from './webStackScreenListeners'
import { staticScreenTransitionOptions, useMainStackTransitionOptionsFactory } from './useScreenTransitionOptions'
import { OnboardingStack } from './onboardingStack'
import {
  AccountVerificationScreen,
  CardScreen,
  ReceiveBankDetailsScreen,
  ReceiveLocalAmountScreen,
  ExpressDepositAmountScreen,
  ExpressDepositsSetupScreen,
  ReceiveLocalMomoSetupScreen,
  ReceiveLocalRailScreen,
  ReceiveLocalReviewScreen,
  ReceiveMoneyScreen,
  ReceiveStablecoinDetailsScreen,
  ReceiveTransactionDetailsScreen,
  RecipientsScreen,
  ScanWalletAddressScreen,
  SelectRecentRecipientScreen,
  SelectRecipientScreen,
  SendAmountScreen,
  SendConfirmScreen,
  SendCrossBorderMomoSetupScreen,
  SendPinScreen,
} from './screenRegistry'

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
import TransactionsScreen from '../screens/main/TransactionsScreen'
import MoreScreen from '../screens/main/MoreScreen'
import OpenCurrencyAccountScreen from '../screens/main/OpenCurrencyAccountScreen'
import ProfileEditScreen from '../screens/main/ProfileEditScreen'
import SupportScreen from '../screens/main/SupportScreen'
import TransactionCardScreen from '../screens/main/TransactionCardScreen'
import ChangePasswordScreen from '../screens/main/ChangePasswordScreen'
import ChangePinScreen from '../screens/main/ChangePinScreen'
import MfaSetupScreen from '../screens/main/MfaSetupScreen'
import NotificationsScreen from '../screens/main/NotificationsScreen'
import InAppNotificationsScreen from '../screens/main/InAppNotificationsScreen'
import LegalScreen from '../screens/main/LegalScreen'
import PayrollApprovalScreen from '../screens/payroll/PayrollApprovalScreen'
import PayrollConnectionsScreen from '../screens/payroll/PayrollConnectionsScreen'
import PayrollConnectionDetailScreen from '../screens/payroll/PayrollConnectionDetailScreen'
import PayrollInvitationScreen from '../screens/payroll/PayrollInvitationScreen'
import PayrollReceivingMethodScreen from '../screens/payroll/PayrollReceivingMethodScreen'

// Transaction Screens – lazy-loaded so receipt capture native modules never run at app launch.
function loadTransactionDetailsScreen() {
  return require('../screens/transactions/TransactionDetailsScreen').default
}

const Stack = createStackNavigator()
const Tab = createBottomTabNavigator()

/** Per-screen resolver owns motion; keep stack defaults minimal to avoid option churn. */
const FLOW_STACK_SCREEN_OPTIONS = {
  headerShown: false,
} as const

function MfaStack() {
  return (
    <Stack.Navigator screenOptions={FLOW_STACK_SCREEN_OPTIONS} screenListeners={webStackScreenListeners}>
      <Stack.Screen name="MfaVerify" component={MfaVerifyScreen} options={staticScreenTransitionOptions('MfaVerify')} />
    </Stack.Navigator>
  )
}

function AuthStack() {
  return (
    <Stack.Navigator screenOptions={FLOW_STACK_SCREEN_OPTIONS} screenListeners={webStackScreenListeners}>
      <Stack.Screen name="Auth" component={AuthScreen} options={staticScreenTransitionOptions('Auth')} />
      <Stack.Screen
        name="ForgotPassword"
        component={ForgotPasswordScreen}
        options={staticScreenTransitionOptions('ForgotPassword')}
      />
      <Stack.Screen
        name="ResetPassword"
        component={ResetPasswordScreen}
        options={staticScreenTransitionOptions('ResetPassword')}
      />
      <Stack.Screen
        name="PinSetup"
        component={PinSetupScreen}
        options={staticScreenTransitionOptions('PinSetup')}
        initialParams={{ mandatory: false }}
      />
      <Stack.Screen name="PinEntry" component={PinEntryScreen} options={staticScreenTransitionOptions('PinEntry')} />
    </Stack.Navigator>
  )
}

function MainTabs() {
  const insets = useSafeAreaInsets()
  const palette = useThemeColors()
  const { showSidebarShell } = useResponsiveLayout()
  const hideTabBarOnWebShell = showSidebarShell
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
        tabBarStyle: hideTabBarOnWebShell
          ? { display: 'none', height: 0 }
          : {
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
            <House size={22} color={focused ? activeColor : inactiveColor} strokeWidth={focused ? 2.25 : 1.75} />
          ),
        }}
      />
      <Tab.Screen
        name="Card"
        component={CardScreen}
        options={{
          tabBarLabel: 'Cards',
          tabBarIcon: ({ focused }) => (
            <CreditCard size={22} color={focused ? activeColor : inactiveColor} strokeWidth={focused ? 2.25 : 1.75} />
          ),
        }}
      />
      <Tab.Screen
        name="Transactions"
        component={TransactionsScreen}
        options={{
          tabBarLabel: 'Transactions',
          tabBarIcon: ({ focused }) => (
            <ActivityIcon size={22} color={focused ? activeColor : inactiveColor} strokeWidth={focused ? 2.25 : 1.75} />
          ),
        }}
      />
      <Tab.Screen
        name="More"
        component={MoreScreen}
        options={{
          tabBarLabel: 'More',
          tabBarIcon: ({ focused }) => (
            <Grip size={22} color={focused ? activeColor : inactiveColor} strokeWidth={focused ? 2.25 : 1.75} />
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
      <PinSetupPrompt visible={pinPromptVisible} onSetup={handlePinSetup} onDismiss={handleDismissPinPrompt} />
    </>
  )
}

function MainStack() {
  const transitionOptions = useMainStackTransitionOptionsFactory()

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
        }}
        screenListeners={webStackScreenListeners}
      >
        <Stack.Screen name="MainTabs" component={MainTabs} options={transitionOptions('MainTabs')} />
        <Stack.Screen name="PinSetup" component={PinSetupScreen} options={transitionOptions('PinSetup')} />
        <Stack.Screen
          name="SelectRecentRecipient"
          component={SelectRecentRecipientScreen}
          options={transitionOptions('SelectRecentRecipient')}
        />
        <Stack.Screen
          name="ScanWalletAddress"
          component={ScanWalletAddressScreen}
          options={transitionOptions('ScanWalletAddress')}
        />
        <Stack.Screen name="SendAmount" component={SendAmountScreen} options={transitionOptions('SendAmount')} />
        <Stack.Screen
          name="SelectRecipient"
          component={SelectRecipientScreen}
          options={transitionOptions('SelectRecipient')}
        />
        <Stack.Screen
          name="SendCrossBorderMomoSetup"
          component={SendCrossBorderMomoSetupScreen}
          options={transitionOptions('SendCrossBorderMomoSetup')}
        />
        <Stack.Screen name="SendConfirm" component={SendConfirmScreen} options={transitionOptions('SendConfirm')} />
        <Stack.Screen name="SendPin" component={SendPinScreen} options={transitionOptions('SendPin')} />
        <Stack.Screen name="ReceiveMoney" component={ReceiveMoneyScreen} options={transitionOptions('ReceiveMoney')} />
        <Stack.Screen
          name="ReceiveBankDetails"
          component={ReceiveBankDetailsScreen}
          options={transitionOptions('ReceiveBankDetails')}
        />
        <Stack.Screen
          name="ReceiveStablecoinDetails"
          component={ReceiveStablecoinDetailsScreen}
          options={transitionOptions('ReceiveStablecoinDetails')}
        />
        <Stack.Screen
          name="ReceiveLocalRail"
          component={ReceiveLocalRailScreen}
          options={transitionOptions('ReceiveLocalRail')}
        />
        <Stack.Screen
          name="ReceiveLocalAmount"
          component={ReceiveLocalAmountScreen}
          options={transitionOptions('ReceiveLocalAmount')}
        />
        <Stack.Screen
          name="ExpressDepositAmount"
          component={ExpressDepositAmountScreen}
          options={transitionOptions('ExpressDepositAmount')}
        />
        <Stack.Screen
          name="ExpressDepositsSetup"
          component={ExpressDepositsSetupScreen}
          options={transitionOptions('ExpressDepositsSetup')}
        />
        <Stack.Screen
          name="ReceiveLocalMomoSetup"
          component={ReceiveLocalMomoSetupScreen}
          options={transitionOptions('ReceiveLocalMomoSetup')}
        />
        <Stack.Screen
          name="ReceiveLocalReview"
          component={ReceiveLocalReviewScreen}
          options={transitionOptions('ReceiveLocalReview')}
        />
        <Stack.Screen
          name="OpenCurrencyAccount"
          component={OpenCurrencyAccountScreen}
          options={transitionOptions('OpenCurrencyAccount')}
        />
        <Stack.Screen
          name="TransactionDetails"
          getComponent={loadTransactionDetailsScreen}
          options={transitionOptions('TransactionDetails')}
        />
        <Stack.Screen name="Recipients" component={RecipientsScreen} options={transitionOptions('Recipients')} />
        <Stack.Screen name="Card" component={CardScreen} options={transitionOptions('Card')} />
        <Stack.Screen
          name="TransactionCard"
          component={TransactionCardScreen}
          options={transitionOptions('TransactionCard')}
        />
        <Stack.Screen name="Support" component={SupportScreen} options={transitionOptions('Support')} />
        <Stack.Screen name="Legal" component={LegalScreen} options={transitionOptions('Legal')} />
        <Stack.Screen
          name="ReceiveTransactionDetails"
          component={ReceiveTransactionDetailsScreen}
          options={transitionOptions('ReceiveTransactionDetails')}
        />
        <Stack.Screen
          name="AccountVerification"
          component={AccountVerificationScreen}
          options={transitionOptions('AccountVerification')}
        />
        <Stack.Screen name="Profile" component={ProfileEditScreen} options={transitionOptions('Profile')} />
        <Stack.Screen
          name="ChangePassword"
          component={ChangePasswordScreen}
          options={transitionOptions('ChangePassword')}
        />
        <Stack.Screen name="ChangePin" component={ChangePinScreen} options={transitionOptions('ChangePin')} />
        <Stack.Screen name="MfaSetup" component={MfaSetupScreen} options={transitionOptions('MfaSetup')} />
        <Stack.Screen
          name="Notifications"
          component={NotificationsScreen}
          options={transitionOptions('Notifications')}
        />
        <Stack.Screen
          name="InAppNotifications"
          component={InAppNotificationsScreen}
          options={transitionOptions('InAppNotifications')}
        />
        <Stack.Screen
          name="PayrollApproval"
          component={PayrollApprovalScreen}
          options={transitionOptions('PayrollApproval')}
        />
        <Stack.Screen
          name="PayrollConnections"
          component={PayrollConnectionsScreen}
          options={transitionOptions('PayrollConnections')}
        />
        <Stack.Screen
          name="PayrollConnectionDetail"
          component={PayrollConnectionDetailScreen}
          options={transitionOptions('PayrollConnectionDetail')}
        />
        <Stack.Screen
          name="PayrollInvitation"
          component={PayrollInvitationScreen}
          options={transitionOptions('PayrollInvitation')}
        />
        <Stack.Screen
          name="PayrollReceivingMethod"
          component={PayrollReceivingMethodScreen}
          options={transitionOptions('PayrollReceivingMethod')}
        />
      </Stack.Navigator>
    </View>
  )
}

const ONBOARDING_COMPLETED_KEY = '@easner_onboarding_completed'

function PinGateSetupStack() {
  return (
    <Stack.Navigator screenOptions={FLOW_STACK_SCREEN_OPTIONS} screenListeners={webStackScreenListeners}>
      <Stack.Screen
        name="PinSetupGate"
        component={PinSetupScreen}
        options={staticScreenTransitionOptions('PinSetupGate')}
        initialParams={{ mandatory: true }}
      />
    </Stack.Navigator>
  )
}

function PinGateEntryStack() {
  return (
    <Stack.Navigator screenOptions={FLOW_STACK_SCREEN_OPTIONS} screenListeners={webStackScreenListeners}>
      <Stack.Screen
        name="PinEntryGate"
        component={PinEntryScreen}
        options={staticScreenTransitionOptions('PinEntryGate')}
      />
    </Stack.Navigator>
  )
}

/** Same canvas as PIN screens – avoids blank frames during auth / PIN / main handoffs. */
function AuthFlowLoadingShell({ palette, testId }: { palette: ReturnType<typeof useThemeColors>; testId?: string }) {
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
  const { showSuccess } = useToast()
  const signOutRef = useRef(signOut)
  signOutRef.current = signOut
  const palette = useThemeColors()
  const [pinGate, setPinGate] = useState<'loading' | 'setup' | 'pin' | 'main'>('loading')
  const [lockTick, setLockTick] = useState(0)
  const [onboardingCompleted, setOnboardingCompleted] = useState<boolean | null>(Platform.OS === 'web' ? true : null)
  // PIN TEMPORARILY DISABLED - keeping state variables for easy re-enable
  // const [pinSetup, setPinSetup] = useState<boolean | null>(null)
  // const [sessionValid, setSessionValid] = useState<boolean | null>(null)
  const [checkingAuth, setCheckingAuth] = useState(Platform.OS !== 'web')

  useEffect(() => {
    if (!user?.id) return
    void (async () => {
      try {
        const flag = await AsyncStorage.getItem(ACCOUNT_CLOSURE_CANCELLED_KEY)
        if (flag === '1') {
          await AsyncStorage.removeItem(ACCOUNT_CLOSURE_CANCELLED_KEY).catch(() => undefined)
          showSuccess('Account closure cancelled. Welcome back!')
        }
      } catch {
        // ignore
      }
    })()
  }, [user?.id, showSuccess])

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
      if (Platform.OS === 'web') {
        setOnboardingCompleted(true)
        setCheckingAuth(false)
        return
      }
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
        if (Platform.OS === 'web' && user?.id) {
          markWebPinSessionUnlocked(user.id)
        }
        setPinGate('main')
        // Defer Intercom off the unlock/navigation frame so Support (and other) pushes stay snappy.
        setTimeout(() => {
          prefetchIntercomModule()
          void prepareIntercomMessenger()
        }, 750)
      } else if (event === 'locked') {
        const avatarUri = avatarImageUri(userProfile?.profile?.avatar_url)
        if (avatarUri) {
          void warmAvatarCacheAsync(avatarUri)
        }
        setPinGate('pin')
      }
      setLockTick((t) => t + 1)
    })
  }, [user?.id, userProfile?.profile?.avatar_url])

  useEffect(() => {
    const ready = pinGate === 'main'
    setPushNavMainReady(ready)
    if (!ready) return
    const navRef = (global as any).rootNavigationRef?.current
    enterMainAppOnWeb()
    const scope: PersonalScope | null = user?.id ? { kind: 'personal', userId: user.id } : null
    flushPendingPushNavigation(navRef, scope)
    flushPendingDeepLinkNavigation(navRef)
    const warmTimer = setTimeout(() => {
      prefetchIntercomModule()
      void prepareIntercomMessenger()
    }, 750)
    return () => clearTimeout(warmTimer)
  }, [pinGate, lockTick, user?.id])

  // Prefetch Intercom native module on PIN entry; full identity warm waits until unlock (above).
  useEffect(() => {
    if (!user?.id || pinGate !== 'pin') return
    const prefetchTimer = setTimeout(() => {
      prefetchIntercomModule()
    }, 300)
    const scope: PersonalScope = { kind: 'personal', userId: user.id }
    void (async () => {
      const pending = await peekPendingPushPayload()
      if (pending?.screen === 'TransactionDetails') {
        await warmPendingPushTransactionDetail(scope)
      }
    })()
    return () => clearTimeout(prefetchTimer)
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
    if (Platform.OS === 'web') return
    if (!user?.id || pinGate !== 'main') return
    const handleAppStateChange = async (nextAppState: AppStateStatus) => {
      if (nextAppState !== 'active') return
      try {
        await updateSessionActivity()
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
    if (Platform.OS === 'web') return
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

  // Onboarding key read – match app background so the chain onboarding → auth → PIN → main never flashes empty.
  if (onboardingCompleted === null || checkingAuth) {
    return <AuthFlowLoadingShell palette={palette} testId="Bootstrapping app" />
  }

  // If onboarding not completed, show onboarding screen FIRST (before checking user)
  // This ensures new users see onboarding even if they're not logged in
  const skipOnboarding = Platform.OS === 'web'
  if (!skipOnboarding && !onboardingCompleted) {
    return <OnboardingStack key="onboarding-stack" />
  }

  // After onboarding is completed, check user authentication
  // IMPORTANT: during cold start, Supabase session restore happens asynchronously.
  // While `loading` is true, do NOT flash the Auth stack (login screen) – keep a
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
   * 2. MFA when required (`mfaPending`) – wait until `mfaGateResolved`
   * 3. App PIN create or unlock (`pinGate`)
   * 4. Main app
   */
  if (user && !mfaGateResolved && !mfaPending) {
    return <AuthFlowLoadingShell palette={palette} testId="Checking sign-in security" />
  }

  if (user && mfaPending) {
    return <MfaStack key="mfa-stack" />
  }

  /** Session bootstrap without a user – should be handled above (kept for safety). */
  if (loading && !user) {
    return <AuthFlowLoadingShell palette={palette} testId="Restoring session" />
  }

  if (user && pinGate === 'loading') {
    return <AuthFlowLoadingShell palette={palette} testId="Preparing app" />
  }

  if (user && pinGate === 'setup') {
    return <PinGateSetupStack key="pin-gate-setup" />
  }

  if (Platform.OS === 'web' && (pinGate === 'main' || pinGate === 'pin')) {
    return (
      <MobileAppLockShell locked={pinGate === 'pin'}>
        <ResponsiveAppShell>
          <MainStack />
        </ResponsiveAppShell>
      </MobileAppLockShell>
    )
  }

  if (user && pinGate === 'pin') {
    return <PinGateEntryStack key="pin-gate-entry" />
  }

  if (user && pinGate === 'main') {
    return (
      <ResponsiveAppShell key="main-app-shell">
        <MainStack />
      </ResponsiveAppShell>
    )
  }

  if (user) {
    return (
      <ResponsiveAppShell>
        <MainStack />
      </ResponsiveAppShell>
    )
  }

  return <AuthStack key="auth-stack-no-user" />
}

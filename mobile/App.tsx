import React, { useEffect, useRef, useState } from 'react'
import { NavigationContainer, NavigationContainerRef } from '@react-navigation/native'
import { StatusBar } from 'expo-status-bar'
import { View, Text, StyleSheet, AppState, AppStateStatus, Animated } from 'react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { useFonts } from 'expo-font'
import * as SplashScreen from 'expo-splash-screen'
import { updateSessionActivity, isSessionValid } from './src/lib/pinAuth'
import {
  Outfit_400Regular,
  Outfit_500Medium,
  Outfit_600SemiBold,
  Outfit_700Bold,
} from '@expo-google-fonts/outfit'
import { AuthProvider, useAuth } from './src/contexts/AuthContext'
import { UserDataProvider } from './src/contexts/UserDataContext'
import { NotificationsProvider } from './src/contexts/NotificationsContext'
import { BalanceProvider } from './src/contexts/BalanceContext'
import { ToastProvider } from './src/components/ToastProvider'
import { PostHogProvider } from './src/components/PostHogProvider'
import { analytics } from './src/lib/analytics'
import { deepLinkService } from './src/services/DeepLinkService'
import { pushNotificationService } from './src/lib/pushNotificationService'
import AppNavigator from './src/navigation/AppNavigator'
import CustomSplashScreen from './src/components/SplashScreen'
import { PushNotificationBootstrap } from './src/components/PushNotificationBootstrap'
import { colors } from './src/theme'

// Keep the splash screen visible while we load fonts
SplashScreen.preventAutoHideAsync()

// Inner app component that has access to AuthContext
function AppContent() {
  const navigationRef = useRef<NavigationContainerRef<any>>(null)
  const routeNameRef = useRef<string>('')
  const { loading: authLoading } = useAuth()
  const getActiveRouteName = (route: any): string => {
    if (!route) return 'Unknown'
    if (route.state && route.state.index != null) {
      return getActiveRouteName(route.state.routes[route.state.index])
    }
    return route.name || 'Unknown'
  }

  const [splashFinished, setSplashFinished] = useState(false)
  const appFadeAnim = useRef(new Animated.Value(0)).current

  // Expose navigation ref globally for logout navigation
  useEffect(() => {
    ;(global as any).rootNavigationRef = navigationRef
    return () => {
      delete (global as any).rootNavigationRef
    }
  }, [])

  // Fade in app content when splash finishes
  useEffect(() => {
    if (splashFinished) {
      Animated.timing(appFadeAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }).start()
    }
  }, [splashFinished, appFadeAnim])

  // Determine if splash screen is ready to finish (wait for auth to load)
  // AppNavigator will handle onboarding check internally
  const isSplashReady = !authLoading

  // Show splash screen until auth is ready (minimum 3 seconds)
  if (!splashFinished) {
    return <CustomSplashScreen onFinish={() => setSplashFinished(true)} isReady={isSplashReady} />
  }

  return (
    <Animated.View style={{ flex: 1, opacity: appFadeAnim }}>
      <NavigationContainer
        ref={navigationRef}
        onReady={() => {
          analytics.setScreenTrackingMode('auto')
          const currentRoute = navigationRef.current?.getCurrentRoute()
          const currentRouteName = getActiveRouteName(currentRoute)
          routeNameRef.current = currentRouteName
          analytics.trackNavigationScreenView(currentRouteName)
        }}
        onStateChange={() => {
          const currentRoute = navigationRef.current?.getCurrentRoute()
          const currentRouteName = getActiveRouteName(currentRoute)
          if (routeNameRef.current !== currentRouteName) {
            routeNameRef.current = currentRouteName
            analytics.trackNavigationScreenView(currentRouteName)
          }
        }}
        theme={{
          colors: {
            primary: colors.primary.main,
            background: colors.background.primary,
            card: colors.background.primary,
            text: colors.text.primary,
            border: colors.border.default,
            notification: colors.error.main,
          },
          fonts: {
            regular: {
              fontFamily: 'Outfit-Regular',
              fontWeight: '400' as const,
            },
            medium: {
              fontFamily: 'Outfit-Medium',
              fontWeight: '500' as const,
            },
            bold: {
              fontFamily: 'Outfit-Bold',
              fontWeight: '700' as const,
            },
            heavy: {
              fontFamily: 'Outfit-Bold',
              fontWeight: '800' as const,
            },
          },
        }}
      >
        <StatusBar style="dark" />
        <AppNavigator />
      </NavigationContainer>
    </Animated.View>
  )
}

export default function App() {
  console.log('App.tsx: App component rendering')
  
  const [fontsLoaded] = useFonts({
    'Outfit-Regular': Outfit_400Regular,
    'Outfit-Medium': Outfit_500Medium,
    'Outfit-SemiBold': Outfit_600SemiBold,
    'Outfit-Bold': Outfit_700Bold,
  })
  
  // Initialize deep linking
  useEffect(() => {
    deepLinkService.initialize()
  }, [])

  // Foreground/tap listeners only; token registration is gated on user prefs in PushNotificationBootstrap
  useEffect(() => {
    try {
      const receivedSubscription = pushNotificationService.addNotificationReceivedListener(
        async (notification) => {
          console.log('Notification received:', notification)
        }
      )

      const responseSubscription = pushNotificationService.addNotificationResponseReceivedListener(
        (response) => {
          console.log('Notification tapped:', response)
          const data = response.notification.request.content.data

          if (data?.transactionId && (global as any).rootNavigationRef?.current) {
            ;(global as any).rootNavigationRef.current.navigate('TransactionDetails', {
              transactionId: data.transactionId,
              fromScreen: 'PushNotification',
            })
          } else if (data?.type === 'card_transaction' && (global as any).rootNavigationRef?.current) {
            ;(global as any).rootNavigationRef.current.navigate('TransactionCard', {})
          } else if ((global as any).rootNavigationRef?.current) {
            ;(global as any).rootNavigationRef.current.navigate('InAppNotifications', {})
          }
        }
      )

      return () => {
        pushNotificationService.removeNotificationSubscription(receivedSubscription)
        pushNotificationService.removeNotificationSubscription(responseSubscription)
      }
    } catch (error) {
      console.error('Error initializing push listeners:', error)
    }
  }, [])

  // Track app state changes for session management
  useEffect(() => {
    const handleAppStateChange = async (nextAppState: AppStateStatus) => {
      if (nextAppState === 'active') {
        // App came to foreground - update session activity
        await updateSessionActivity()
        // Check if session is still valid (AppNavigator will handle routing)
      }
    }

    const subscription = AppState.addEventListener('change', handleAppStateChange)
    return () => subscription.remove()
  }, [])
  
  // Wait for fonts to load before showing anything
  if (!fontsLoaded) {
    return null
  }
  
  try {
    return (
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider>
          <PostHogProvider>
            <AuthProvider>
              <PushNotificationBootstrap />
              <BalanceProvider>
              <UserDataProvider>
                <NotificationsProvider>
                  <ToastProvider>
                    <AppContent />
                  </ToastProvider>
                </NotificationsProvider>
              </UserDataProvider>
              </BalanceProvider>
            </AuthProvider>
          </PostHogProvider>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    )
  } catch (error) {
    console.error('App.tsx: Error in App component:', error)
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>Error loading app: {String(error)}</Text>
      </View>
    )
  }
}

const styles = StyleSheet.create({
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    padding: 20,
  },
  errorText: {
    fontSize: 16,
    color: '#ef4444',
    textAlign: 'center',
  },
})
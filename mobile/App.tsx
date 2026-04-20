import React, { useEffect, useRef, useState } from 'react'
import { NavigationContainer, NavigationContainerRef } from '@react-navigation/native'
import { StatusBar } from 'expo-status-bar'
import { View, Text, StyleSheet, Animated, Platform, Appearance } from 'react-native'
import * as BackgroundTask from 'expo-background-task'
import * as TaskManager from 'expo-task-manager'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { useFonts } from 'expo-font'
import * as SplashScreen from 'expo-splash-screen'
import * as SystemUI from 'expo-system-ui'
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  Inter_800ExtraBold,
} from '@expo-google-fonts/inter'
import {
  PlayfairDisplay_400Regular,
  PlayfairDisplay_500Medium,
  PlayfairDisplay_600SemiBold,
  PlayfairDisplay_700Bold,
} from '@expo-google-fonts/playfair-display'
import { AuthProvider, useAuth } from './src/contexts/AuthContext'
import { NotificationsProvider } from './src/contexts/NotificationsContext'
import { BalanceProvider } from './src/contexts/BalanceContext'
import { QueryProvider } from './src/query'
import { ToastProvider } from './src/components/ToastProvider'
import { PostHogProvider } from './src/components/PostHogProvider'
import { analytics } from './src/lib/analytics'
import { deepLinkService } from './src/services/DeepLinkService'
import { pushNotificationService } from './src/lib/pushNotificationService'
import AppNavigator from './src/navigation/AppNavigator'
import { PushNotificationBootstrap } from './src/components/PushNotificationBootstrap'
import { resolveThemeColors } from './src/theme'
import {
  ThemePaletteProvider,
  useThemeColors,
  useThemeScheme,
} from './src/contexts/ThemePaletteContext'
import {
  BACKGROUND_TASK_IDENTIFIER,
  registerBackgroundTaskAsync,
} from './src/lib/backgroundTasks'

// Keep the splash screen visible while we load fonts
SplashScreen.preventAutoHideAsync()

// Inner app component that has access to AuthContext
function AppContent() {
  const navigationRef = useRef<NavigationContainerRef<any>>(null)
  const routeNameRef = useRef<string>('')
  const { loading: authLoading } = useAuth()
  const palette = useThemeColors()
  const scheme = useThemeScheme()
  const getActiveRouteName = (route: any): string => {
    if (!route) return 'Unknown'
    if (route.state && route.state.index != null) {
      return getActiveRouteName(route.state.routes[route.state.index])
    }
    return route.name || 'Unknown'
  }

  const [splashFinished, setSplashFinished] = useState(false)
  const appFadeAnim = useRef(new Animated.Value(0)).current
  /** When `AppContent` first mounts (fonts already loaded), for minimum branded splash duration. */
  const splashMountAt = useRef(Date.now())

  // Expose navigation ref globally for logout navigation
  useEffect(() => {
    ;(global as any).rootNavigationRef = navigationRef
    return () => {
      delete (global as any).rootNavigationRef
    }
  }, [])

  // Single native splash (`app.json` + `expo-splash-screen`): hide only after auth is ready and min display time.
  // Avoids a second JS `Image` pass that looked like a different logo (native vs Metro scaling / stale prebuild assets).
  useEffect(() => {
    if (authLoading || splashFinished) return
    const elapsed = Date.now() - splashMountAt.current
    const remaining = Math.max(0, 3000 - elapsed)
    let cancelled = false
    const t = setTimeout(() => {
      void (async () => {
        if (cancelled) return
        try {
          await SplashScreen.hideAsync()
        } catch (e) {
          console.warn('SplashScreen.hideAsync', e)
        }
        if (!cancelled) setSplashFinished(true)
      })()
    }, remaining)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [authLoading, splashFinished])

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

  if (!splashFinished) {
    return null
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
          dark: scheme === 'dark',
          colors: {
            primary: palette.primary.main,
            background: palette.background.primary,
            card: palette.semantic.card,
            text: palette.text.primary,
            border: palette.semantic.border,
            notification: palette.error.main,
          },
          fonts: {
            regular: {
              fontFamily: 'Inter_400Regular',
              fontWeight: '400' as const,
            },
            medium: {
              fontFamily: 'Inter_500Medium',
              fontWeight: '500' as const,
            },
            bold: {
              fontFamily: 'Inter_700Bold',
              fontWeight: '700' as const,
            },
            heavy: {
              fontFamily: 'Inter_800ExtraBold',
              fontWeight: '800' as const,
            },
          },
        }}
      >
        <StatusBar
          style={scheme === 'dark' ? 'light' : 'dark'}
          backgroundColor={Platform.OS === 'android' ? palette.background.primary : undefined}
        />
        <AppNavigator />
      </NavigationContainer>
    </Animated.View>
  )
}

export default function App() {
  console.log('App.tsx: App component rendering')
  
  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Inter_800ExtraBold,
    PlayfairDisplay_400Regular,
    PlayfairDisplay_500Medium,
    PlayfairDisplay_600SemiBold,
    PlayfairDisplay_700Bold,
  })
  
  // Initialize deep linking
  useEffect(() => {
    deepLinkService.initialize()
  }, [])

  // Edge-to-edge: match root window / nav bar scrim to app background; supports `userInterfaceStyle` with expo-system-ui.
  useEffect(() => {
    const applyBackground = () => {
      const bg = resolveThemeColors(Appearance.getColorScheme()).background.primary
      void SystemUI.setBackgroundColorAsync(bg)
    }
    applyBackground()
    const sub = Appearance.addChangeListener(() => applyBackground())
    return () => sub.remove()
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

  useEffect(() => {
    if (Platform.OS === 'web') return

    let cancelled = false
    void (async () => {
      try {
        const status = await BackgroundTask.getStatusAsync()
        if (cancelled) return
        if (status === BackgroundTask.BackgroundTaskStatus.Restricted) {
          console.warn('Background tasks unavailable (Restricted)')
          return
        }
        const alreadyRegistered = await TaskManager.isTaskRegisteredAsync(
          BACKGROUND_TASK_IDENTIFIER
        )
        if (!alreadyRegistered) {
          await registerBackgroundTaskAsync()
        }
      } catch (e) {
        console.warn('Background task registration failed:', e)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [])

  // Wait for fonts to load before showing anything
  if (!fontsLoaded) {
    return null
  }
  
  try {
    return (
      <GestureHandlerRootView style={{ flex: 1 }}>
        {/* Global safe areas (react-native-safe-area-context). Expo Router not used — React Navigation + stack/tabs. */}
        <SafeAreaProvider>
          <ThemePaletteProvider>
            <PostHogProvider>
              <AuthProvider>
                <QueryProvider>
                  <PushNotificationBootstrap />
                  <BalanceProvider>
                    <NotificationsProvider>
                      <ToastProvider>
                        <AppContent />
                      </ToastProvider>
                    </NotificationsProvider>
                  </BalanceProvider>
                </QueryProvider>
              </AuthProvider>
            </PostHogProvider>
          </ThemePaletteProvider>
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
import React, { useEffect, useRef, useState } from 'react'
import { NavigationContainer, NavigationContainerRef } from '@react-navigation/native'
import Constants from 'expo-constants'
import { StatusBar } from 'expo-status-bar'
import { View, Text, StyleSheet, Animated, Platform } from 'react-native'
import * as BackgroundTask from 'expo-background-task'
import * as TaskManager from 'expo-task-manager'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { KeyboardProvider } from 'react-native-keyboard-controller'
import { PressablesConfig } from 'pressto'
import { useFonts } from 'expo-font'
import * as SplashScreen from 'expo-splash-screen'
import * as SystemUI from 'expo-system-ui'
import { AuthProvider, useAuth } from './src/contexts/AuthContext'
import { NotificationsProvider } from './src/contexts/NotificationsContext'
import { BalanceProvider } from './src/contexts/BalanceContext'
import { QueryProvider } from './src/query'
import { ToastProvider } from './src/components/ToastProvider'
import { analytics } from './src/lib/analytics'
import { deepLinkService } from './src/services/DeepLinkService'
import { pushNotificationService } from './src/lib/pushNotificationService'
import {
  bootstrapPushNotificationDeepLink,
  flushPendingPushNavigation,
  stashPendingPushFromNotificationData,
} from './src/lib/pendingPushNavigation'
import { supabase } from './src/lib/supabase'
import {
  isMoneyMovementPush,
  refreshMoneyFeedsForUser,
} from './src/query/refresh-money-feeds'
import AppNavigator from './src/navigation/AppNavigator'
import { webLinking } from './src/navigation/linking'
import { formatWebDocumentTitle, setWebDocumentTitle } from './src/navigation/webDocumentTitle'
import { WebIdleSessionBridge } from './src/components/WebIdleSessionBridge'
import { markWebBfcacheRestore } from './src/lib/pinAuth'
import { ResponsiveLayoutProvider } from './src/contexts/ResponsiveLayoutContext'
import { ShellAwareSafeArea } from './src/components/layout/ShellAwareSafeArea'
import { WebViewportFrame } from './src/components/layout/WebViewportFrame'
import { PushNotificationBootstrap } from './src/components/PushNotificationBootstrap'
import { WebIntercomMessenger } from './src/components/WebIntercomMessenger'
import {
  ThemePaletteProvider,
  useThemeColors,
} from './src/contexts/ThemePaletteContext'
import {
  BACKGROUND_TASK_IDENTIFIER,
  registerBackgroundTaskAsync,
} from './src/lib/backgroundTasks'
import { lightColors } from './src/theme/colors'
import { isIosOnMac, MAC_INSTALLED_MOBILE_DESIGN_POINTS } from './src/lib/effective-window'
import { supabaseConfigError } from './src/lib/supabase'
import { warmBundledFlagCache } from './src/lib/warmBundledFlagCache'
import { prefetchIntercomModule } from './src/lib/intercom'
import { USE_NATIVE_DRIVER } from './src/lib/animation'

// Keep the splash screen visible while we load fonts
SplashScreen.preventAutoHideAsync()

// Inner app component that has access to AuthContext
function AppContent() {
  const navigationRef = useRef<NavigationContainerRef<any>>(null)
  const routeNameRef = useRef<string>('')
  const { loading: authLoading } = useAuth()
  const palette = useThemeColors()
  const getActiveRouteName = (route: any): string => {
    if (!route) return 'Unknown'
    if (route.state && route.state.index != null) {
      return getActiveRouteName(route.state.routes[route.state.index])
    }
    return route.name || 'Unknown'
  }

  const [splashFinished, setSplashFinished] = useState(false)
  const [navReady, setNavReady] = useState(false)
  /** Leaf route name — used so status bar stays light on dark chrome (e.g. onboarding) after splash hides. */
  const [activeRouteName, setActiveRouteName] = useState('')
  const appFadeAnim = useRef(new Animated.Value(0)).current

  // Expose navigation ref globally for logout navigation
  useEffect(() => {
    ;(global as any).rootNavigationRef = navigationRef
    return () => {
      delete (global as any).rootNavigationRef
    }
  }, [])

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return
    setWebDocumentTitle()
    const html = document.documentElement
    const body = document.body
    const root = document.getElementById('root')
    html.style.height = '100%'
    body.style.height = '100%'
    body.style.margin = '0'
    if (root) {
      root.style.height = '100%'
      root.style.display = 'flex'
      root.style.flexDirection = 'column'
      root.style.minHeight = '100%'
    }
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) markWebBfcacheRestore()
    }
    window.addEventListener('pageshow', onPageShow)
    return () => window.removeEventListener('pageshow', onPageShow)
  }, [])

  // Single native splash (`app.json` + `expo-splash-screen`): keep it visible until:
  // - Supabase session restore has resolved (`authLoading` false)
  // - React Navigation has mounted (`navReady` true)
  //
  // This avoids the "blank gap" / auth flash between Splash → Login → PIN on cold starts.
  useEffect(() => {
    if (splashFinished) return
    if (authLoading) return
    if (!navReady) return
    let cancelled = false
    void (async () => {
      if (cancelled) return
      try {
        await SplashScreen.hideAsync()
      } catch (e) {
        console.warn('SplashScreen.hideAsync', e)
      }
      if (!cancelled) setSplashFinished(true)
    })()
    return () => {
      cancelled = true
    }
  }, [authLoading, navReady, splashFinished])

  // Cold-open from notification: stash intent + flush when main stack is ready (PIN may still be showing).
  useEffect(() => {
    if (!navReady || Platform.OS === 'web') return
    void bootstrapPushNotificationDeepLink()
  }, [navReady])

  // Fade in app content when splash finishes
  useEffect(() => {
    if (splashFinished) {
      Animated.timing(appFadeAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: USE_NATIVE_DRIVER,
      }).start()
    }
  }, [splashFinished, appFadeAnim])

  const nav = (
    <NavigationContainer
      ref={navigationRef}
      linking={Platform.OS === 'web' ? webLinking : undefined}
      documentTitle={
        Platform.OS === 'web'
          ? {
              formatter: formatWebDocumentTitle,
            }
          : undefined
      }
      onReady={() => {
        setNavReady(true)
        analytics.setScreenTrackingMode('auto')
        const currentRoute = navigationRef.current?.getCurrentRoute()
        const currentRouteName = getActiveRouteName(currentRoute)
        routeNameRef.current = currentRouteName
        setActiveRouteName(currentRouteName)
        analytics.trackNavigationScreenView(currentRouteName)
      }}
      onStateChange={() => {
        const currentRoute = navigationRef.current?.getCurrentRoute()
        const currentRouteName = getActiveRouteName(currentRoute)
        setActiveRouteName(currentRouteName)
        if (routeNameRef.current !== currentRouteName) {
          routeNameRef.current = currentRouteName
          analytics.trackNavigationScreenView(currentRouteName)
        }
      }}
      theme={{
        dark: false,
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
            fontFamily: 'Geist-Regular',
            fontWeight: '400' as const,
          },
          medium: {
            fontFamily: 'Geist-Medium',
            fontWeight: '500' as const,
          },
          bold: {
            fontFamily: 'Geist-Bold',
            fontWeight: '700' as const,
          },
          heavy: {
            fontFamily: 'Geist-Black',
            fontWeight: '800' as const,
          },
        },
      }}
    >
      <StatusBar
        // Native splash (#007ACC): light icons. Main chrome is light: dark icons.
        // Onboarding keeps light icons on dark background after splash is dismissed.
        style={
          !splashFinished || activeRouteName === 'Onboarding' ? 'light' : 'dark'
        }
        backgroundColor={Platform.OS === 'android' ? palette.background.primary : undefined}
      />
      <WebIdleSessionBridge />
      <AppNavigator />
    </NavigationContainer>
  )

  return (
    <Animated.View style={[styles.appRoot, { opacity: splashFinished ? appFadeAnim : 0 }]}>
      {isIosOnMac() ? (
        <View style={[styles.macFrameOuter, { backgroundColor: palette.background.primary }]}>
          <View
            style={[
              styles.macFrameInner,
              {
                width: MAC_INSTALLED_MOBILE_DESIGN_POINTS.width,
                backgroundColor: palette.background.primary,
              },
            ]}
          >
            {nav}
          </View>
        </View>
      ) : Platform.OS === 'web' ? (
        <WebViewportFrame>{nav}</WebViewportFrame>
      ) : (
        nav
      )}
    </Animated.View>
  )
}

export default function App() {
  const [fontsLoaded] = useFonts({
    'Geist-Regular': require('./assets/fonts/geist-sans/Geist-Regular.ttf'),
    'Geist-Medium': require('./assets/fonts/geist-sans/Geist-Medium.ttf'),
    'Geist-SemiBold': require('./assets/fonts/geist-sans/Geist-SemiBold.ttf'),
    'Geist-Bold': require('./assets/fonts/geist-sans/Geist-Bold.ttf'),
    'Geist-Black': require('./assets/fonts/geist-sans/Geist-Black.ttf'),
  })
  
  // Initialize deep linking
  useEffect(() => {
    deepLinkService.initialize()
  }, [])

  useEffect(() => {
    warmBundledFlagCache()
    prefetchIntercomModule()
  }, [])

  // Edge-to-edge: match root window / nav bar scrim to app background; supports `userInterfaceStyle` with expo-system-ui.
  useEffect(() => {
    void SystemUI.setBackgroundColorAsync(lightColors.background.primary)
  }, [])

  useEffect(() => {
    if (!fontsLoaded || !supabaseConfigError) return
    void SplashScreen.hideAsync().catch((e) => {
      console.warn('SplashScreen.hideAsync', e)
    })
  }, [fontsLoaded, supabaseConfigError])

  // Foreground/tap listeners only; token registration is gated on user prefs in PushNotificationBootstrap
  useEffect(() => {
    if (Platform.OS === 'web') return
    try {
      const receivedSubscription = pushNotificationService.addNotificationReceivedListener(
        async (notification) => {
          console.log('Notification received:', notification)
          const data = notification.request.content.data as Record<string, unknown> | undefined
          if (!isMoneyMovementPush(data)) return
          const {
            data: { session },
          } = await supabase.auth.getSession()
          if (session?.user?.id) {
            void refreshMoneyFeedsForUser(session.user.id)
          }
        }
      )

      const responseSubscription = pushNotificationService.addNotificationResponseReceivedListener(
        (response) => {
          console.log('Notification tapped:', response)
          const data = response.notification.request.content.data as Record<string, unknown> | undefined
          void (async () => {
            if (isMoneyMovementPush(data)) {
              const {
                data: { session },
              } = await supabase.auth.getSession()
              if (session?.user?.id) {
                await refreshMoneyFeedsForUser(session.user.id)
              }
            }
            await stashPendingPushFromNotificationData(data)
            flushPendingPushNavigation((global as any).rootNavigationRef?.current)
          })()
        },
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
          const env = Constants.executionEnvironment
          const why =
            env === 'storeClient'
              ? 'Background tasks unavailable in Expo Go; test on a dev or release build.'
              : 'Background tasks unavailable (Restricted by current OS/device settings).'
          console.info(why)
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

  if (supabaseConfigError) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorTitle}>App configuration is missing</Text>
        <Text style={styles.errorText}>{supabaseConfigError}</Text>
      </View>
    )
  }
  
  try {
    return (
      <KeyboardProvider>
      <GestureHandlerRootView style={{ flex: 1 }}>
      <PressablesConfig
        animationType="spring"
        animationConfig={{ damping: 28, stiffness: 320 }}
        config={{ minScale: 0.97, activeOpacity: 0.92 }}
      >
        {/* Global safe areas (react-native-safe-area-context). Expo Router not used — React Navigation + stack/tabs. */}
        <SafeAreaProvider>
          <ResponsiveLayoutProvider>
          <ShellAwareSafeArea>
          <ThemePaletteProvider>
              <AuthProvider>
                <QueryProvider>
                  <PushNotificationBootstrap />
                  <WebIntercomMessenger />
                  <BalanceProvider>
                    <NotificationsProvider>
                      <ToastProvider>
                        <AppContent />
                      </ToastProvider>
                    </NotificationsProvider>
                  </BalanceProvider>
                </QueryProvider>
              </AuthProvider>
          </ThemePaletteProvider>
          </ShellAwareSafeArea>
          </ResponsiveLayoutProvider>
        </SafeAreaProvider>
      </PressablesConfig>
      </GestureHandlerRootView>
      </KeyboardProvider>
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
  appRoot: {
    flex: 1,
  },
  macFrameOuter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  macFrameInner: {
    flex: 1,
    maxWidth: '100%',
    alignSelf: 'center',
    overflow: 'hidden',
  },
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
  errorTitle: {
    marginBottom: 8,
    fontSize: 18,
    fontWeight: '700',
    color: '#0f172a',
    textAlign: 'center',
  },
})

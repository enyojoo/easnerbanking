import React, { Component, type ErrorInfo, type ReactNode, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { PressableScale } from 'pressto'
import { CircleAlert } from 'lucide-react-native'
import { borderRadius, colors, fontFamily, spacing, textStyles } from '../theme'
import { haptics } from '../lib/haptics'
import { presentIntercomMessenger, alertIntercomError, intercomPresentErrorMessage } from '../lib/intercom'

function AppCrashScreen({ onRetry }: { onRetry: () => void }) {
  return (
    <View style={styles.root}>
      <View style={styles.iconWrap}>
        <CircleAlert size={36} color={colors.error.main} strokeWidth={2} />
      </View>
      <Text style={styles.title}>Something went wrong</Text>
      <Text style={styles.body}>
        Easner hit an unexpected error. Retry, or contact support if it keeps happening.
      </Text>
      <View style={styles.actions}>
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel="Retry"
          onPress={() => {
            haptics.tap()
            onRetry()
          }}
          style={styles.primary}
        >
          <Text style={styles.primaryLabel}>Retry</Text>
        </PressableScale>
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel="Contact support"
          onPress={() => {
            haptics.tap()
            void presentIntercomMessenger().catch((error) => {
              alertIntercomError('Support', intercomPresentErrorMessage(error))
            })
          }}
          style={styles.secondary}
        >
          <Text style={styles.secondaryLabel}>Support</Text>
        </PressableScale>
      </View>
    </View>
  )
}

type BoundaryProps = {
  children: ReactNode
  onRetry: () => void
}

type BoundaryState = { error: Error | null }

class ErrorBoundary extends Component<BoundaryProps, BoundaryState> {
  state: BoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): BoundaryState {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('RootErrorBoundary', error, info.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children
    return <AppCrashScreen onRetry={this.props.onRetry} />
  }
}

/** Catches render crashes and remounts the tree on Retry. */
export function RootErrorBoundary({ children }: { children: ReactNode }) {
  const [generation, setGeneration] = useState(0)
  return (
    <ErrorBoundary key={generation} onRetry={() => setGeneration((n) => n + 1)}>
      {children}
    </ErrorBoundary>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing[6],
    backgroundColor: colors.background.primary,
  },
  iconWrap: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing[4],
    backgroundColor: colors.error.background,
  },
  title: {
    ...textStyles.headlineLarge,
    fontFamily: fontFamily.semibold,
    color: colors.text.primary,
    textAlign: 'center',
  },
  body: {
    ...textStyles.bodyMedium,
    color: colors.text.secondary,
    textAlign: 'center',
    marginTop: spacing[3],
    marginBottom: spacing[6],
    maxWidth: 320,
  },
  actions: {
    width: '100%',
    maxWidth: 320,
    gap: spacing[3],
  },
  primary: {
    minHeight: 52,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary.main,
  },
  primaryLabel: {
    ...textStyles.titleMedium,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  secondary: {
    minHeight: 52,
    borderRadius: borderRadius.full,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.semantic.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryLabel: {
    ...textStyles.titleMedium,
    color: colors.text.primary,
    fontWeight: '600',
  },
})

import React, { createElement, useEffect, useState } from 'react'
import { View, StyleSheet, Modal, ActivityIndicator, Platform, StatusBar } from 'react-native'
import { WebView } from 'react-native-webview'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { colors } from '../theme'
import { IframeWebViewModalHeader } from './IframeWebViewModalHeader'
import type { BridgeHostedPhase } from '../hooks/useBridgeHostedVerification'
import {
  hostedOnboardingReturnKind,
  isBridgeTosAcceptedMessage,
  isHostedKycMessageOrigin,
  isHostedVerificationCompleteMessage,
  signedAgreementIdFromUnknown,
  signedAgreementIdFromUrl,
} from '../lib/hostedKycUrl'

const TOS_SANDBOX = 'allow-same-origin allow-scripts allow-forms allow-popups allow-modals'
const KYC_SANDBOX = `${TOS_SANDBOX} allow-top-navigation-by-user-activation`

type Props = {
  visible: boolean
  url: string
  title: string
  phase: BridgeHostedPhase
  onClose: () => void
  onHostedEvent: (kind: 'tos' | 'complete', signedAgreementId?: string | null) => void
}

function WebHostedIframe({
  src,
  title,
  phase,
  onLoad,
}: {
  src: string
  title: string
  phase: BridgeHostedPhase
  onLoad: () => void
}) {
  return createElement('iframe', {
    src,
    title,
    allow: 'camera; microphone; clipboard-write',
    referrerPolicy: 'strict-origin-when-cross-origin',
    sandbox: phase === 'tos' ? TOS_SANDBOX : KYC_SANDBOX,
    style: {
      flex: 1,
      width: '100%',
      height: '100%',
      border: 'none',
      minHeight: 0,
      background: colors.background.primary,
    },
    onLoad,
  })
}

export default function BridgeHostedVerificationModal({
  visible,
  url,
  title,
  phase,
  onClose,
  onHostedEvent,
}: Props) {
  const [loading, setLoading] = useState(true)
  const insets = useSafeAreaInsets()
  const androidTopInset =
    Platform.OS === 'android'
      ? Math.max(insets.top, StatusBar.currentHeight != null ? StatusBar.currentHeight : 0)
      : 0

  useEffect(() => {
    if (visible && url) setLoading(true)
  }, [visible, url])

  useEffect(() => {
    if (Platform.OS !== 'web' || !visible) return
    function onMessage(event: MessageEvent) {
      const appOrigin = typeof window !== 'undefined' ? window.location.origin : ''
      if (!isHostedKycMessageOrigin(event.origin, appOrigin)) return
      if (isBridgeTosAcceptedMessage(event.data)) {
        onHostedEvent('tos', signedAgreementIdFromUnknown(event.data))
        return
      }
      if (isHostedVerificationCompleteMessage(event.data)) {
        onHostedEvent(phase === 'tos' ? 'tos' : 'complete', signedAgreementIdFromUnknown(event.data))
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [visible, phase, onHostedEvent])

  const handleNavUrl = (navUrl: string) => {
    const kind = hostedOnboardingReturnKind(navUrl)
    if (!kind) return true
    onHostedEvent(
      kind === 'tos' || phase === 'tos' ? 'tos' : 'complete',
      signedAgreementIdFromUrl(navUrl),
    )
    return false
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View
        style={[
          styles.modalContainer,
          androidTopInset > 0 ? { paddingTop: androidTopInset } : null,
        ]}
      >
        <IframeWebViewModalHeader onClose={onClose} title={title} />
        {loading && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary.main} />
          </View>
        )}
        {url ? (
          Platform.OS === 'web' ? (
            <WebHostedIframe
              src={url}
              title={title}
              phase={phase}
              onLoad={() => setLoading(false)}
            />
          ) : (
            <WebView
              source={{ uri: url }}
              style={styles.webView}
              javaScriptEnabled
              domStorageEnabled
              mediaPlaybackRequiresUserAction={false}
              allowsInlineMediaPlayback
              onLoadStart={() => setLoading(true)}
              onLoadEnd={() => setLoading(false)}
              onError={() => setLoading(false)}
              onShouldStartLoadWithRequest={(request) => handleNavUrl(request.url)}
              onNavigationStateChange={(nav) => {
                if (nav.url) handleNavUrl(nav.url)
              }}
            />
          )
        ) : null}
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  modalContainer: {
    flex: 1,
    backgroundColor: colors.background.primary,
    ...(Platform.OS === 'web' ? { height: '100%' as const } : null),
  },
  loadingContainer: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    marginLeft: -20,
    marginTop: -20,
    zIndex: 1,
  },
  webView: {
    flex: 1,
  },
})

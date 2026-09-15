import React, { createElement, useCallback, useEffect, useRef, useState } from 'react'
import { View, StyleSheet, Modal, ActivityIndicator, Platform, StatusBar } from 'react-native'
import { WebView, type WebViewMessageEvent } from 'react-native-webview'
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

const INJECTED_TOS_WATCH = `
(function () {
  function report() {
    try {
      var href = String(window.location.href || '');
      if (
        href.indexOf('onboarding-complete') !== -1 ||
        href.indexOf('signed_agreement_id') !== -1 ||
        href.indexOf('signedAgreementId') !== -1
      ) {
        if (window.ReactNativeWebView) {
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'bridgeTosAccepted', href: href }));
        }
      }
    } catch (e) {}
  }
  report();
  setTimeout(report, 250);
  setTimeout(report, 800);
})();
true;
`

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
  iframeRef,
  onLoad,
}: {
  src: string
  title: string
  phase: BridgeHostedPhase
  iframeRef: React.Ref<HTMLIFrameElement>
  onLoad: () => void
}) {
  return createElement('iframe', {
    ref: iframeRef,
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
  const iframeRef = useRef<HTMLIFrameElement | null>(null)
  const handedOffRef = useRef(false)
  const androidTopInset =
    Platform.OS === 'android'
      ? Math.max(insets.top, StatusBar.currentHeight != null ? StatusBar.currentHeight : 0)
      : 0

  useEffect(() => {
    if (visible && url) {
      setLoading(true)
      handedOffRef.current = false
    }
  }, [visible, url])

  const emitFromHref = useCallback(
    (href: string) => {
      const kind = hostedOnboardingReturnKind(href)
      if (!kind) return false
      if (handedOffRef.current) return true
      handedOffRef.current = true
      setLoading(true)
      onHostedEvent(
        kind === 'tos' || phase === 'tos' ? 'tos' : 'complete',
        signedAgreementIdFromUrl(href),
      )
      return true
    },
    [onHostedEvent, phase],
  )

  useEffect(() => {
    if (Platform.OS !== 'web' || !visible) return
    function onMessage(event: MessageEvent) {
      const appOrigin = typeof window !== 'undefined' ? window.location.origin : ''
      if (!isHostedKycMessageOrigin(event.origin, appOrigin)) return
      if (isBridgeTosAcceptedMessage(event.data)) {
        if (handedOffRef.current) return
        handedOffRef.current = true
        setLoading(true)
        onHostedEvent('tos', signedAgreementIdFromUnknown(event.data))
        return
      }
      if (isHostedVerificationCompleteMessage(event.data)) {
        if (handedOffRef.current) return
        handedOffRef.current = true
        setLoading(true)
        onHostedEvent(phase === 'tos' ? 'tos' : 'complete', signedAgreementIdFromUnknown(event.data))
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [visible, phase, onHostedEvent])

  const readTosReturnFromIframe = useCallback(() => {
    if (phase !== 'tos') return
    try {
      const href = iframeRef.current?.contentWindow?.location.href ?? ''
      if (href) emitFromHref(href)
    } catch {
      // Cross-origin until Accept lands on our return URL.
    }
  }, [emitFromHref, phase])

  useEffect(() => {
    if (Platform.OS !== 'web' || phase !== 'tos' || !visible || !url) return
    const timer = window.setInterval(readTosReturnFromIframe, 400)
    return () => window.clearInterval(timer)
  }, [phase, readTosReturnFromIframe, url, visible])

  const handleNavUrl = (navUrl: string) => {
    if (emitFromHref(navUrl)) return false
    return true
  }

  const onWebViewMessage = (event: WebViewMessageEvent) => {
    const raw = String(event.nativeEvent.data || '')
    try {
      const parsed = JSON.parse(raw) as { type?: string; href?: string }
      if (parsed.type === 'bridgeTosAccepted' || parsed.href) {
        emitFromHref(String(parsed.href || url))
        return
      }
    } catch {
      if (raw.includes('onboarding-complete') || raw.includes('signed_agreement')) {
        emitFromHref(raw)
      }
    }
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
              iframeRef={iframeRef}
              onLoad={() => {
                setLoading(false)
                readTosReturnFromIframe()
              }}
            />
          ) : (
            <WebView
              source={{ uri: url }}
              style={styles.webView}
              javaScriptEnabled
              domStorageEnabled
              mediaPlaybackRequiresUserAction={false}
              allowsInlineMediaPlayback
              injectedJavaScript={INJECTED_TOS_WATCH}
              onMessage={onWebViewMessage}
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

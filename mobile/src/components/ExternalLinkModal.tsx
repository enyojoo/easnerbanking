import React, { createElement, useEffect, useState } from 'react'
import { View, StyleSheet, Modal, ActivityIndicator, Platform, StatusBar } from 'react-native'
import { WebView } from 'react-native-webview'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { colors } from '../theme'
import { IframeWebViewModalHeader } from './IframeWebViewModalHeader'
import { isHostedKycMessageOrigin, isHostedVerificationCompleteMessage } from '../lib/hostedKycUrl'

interface ExternalLinkModalProps {
  visible: boolean
  url: string
  title?: string
  onClose: () => void
}

function WebHostedIframe({
  src,
  title,
  onLoad,
}: {
  src: string
  title?: string
  onLoad: () => void
}) {
  return createElement('iframe', {
    src,
    title: title || 'Verification',
    allow: 'camera; microphone; clipboard-write',
    referrerPolicy: 'strict-origin-when-cross-origin',
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

export default function ExternalLinkModal({
  visible,
  url,
  title,
  onClose,
}: ExternalLinkModalProps) {
  const [loading, setLoading] = useState(true)
  const insets = useSafeAreaInsets()
  /** Android full-screen modals often draw under the status bar; inset so header + WebView stay below it. */
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
      if (!isHostedVerificationCompleteMessage(event.data)) return
      const appOrigin = typeof window !== 'undefined' ? window.location.origin : ''
      if (!isHostedKycMessageOrigin(event.origin, appOrigin)) return
      onClose()
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [visible, onClose])

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
            <WebHostedIframe src={url} title={title} onLoad={() => setLoading(false)} />
          ) : (
            <WebView
              source={{ uri: url }}
              style={styles.webView}
              javaScriptEnabled={true}
              domStorageEnabled={true}
              onLoadStart={() => setLoading(true)}
              onLoadEnd={() => setLoading(false)}
              onError={() => setLoading(false)}
              onHttpError={(syntheticEvent) => {
                const { nativeEvent } = syntheticEvent
                console.warn('[ExternalLinkModal] HTTP error:', nativeEvent.statusCode, nativeEvent.url)
                setLoading(false)
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

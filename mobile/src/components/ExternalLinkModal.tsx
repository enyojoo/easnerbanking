import React, { useState } from 'react'
import { View, StyleSheet, Modal, ActivityIndicator } from 'react-native'
import { WebView } from 'react-native-webview'
import { colors, spacing } from '../theme'
import { IframeWebViewModalHeader } from './IframeWebViewModalHeader'

interface ExternalLinkModalProps {
  visible: boolean
  url: string
  title?: string
  onClose: () => void
}

export default function ExternalLinkModal({
  visible,
  url,
  title,
  onClose,
}: ExternalLinkModalProps) {
  const [loading, setLoading] = useState(true)

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={styles.modalContainer}>
        <IframeWebViewModalHeader onClose={onClose} title={title} />
        {loading && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary.main} />
          </View>
        )}
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
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  modalContainer: {
    flex: 1,
    backgroundColor: colors.background.primary,
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


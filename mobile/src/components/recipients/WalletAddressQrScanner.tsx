import React, { useCallback, useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native'
import { CameraView, useCameraPermissions } from 'expo-camera'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { X } from 'lucide-react-native'
import { extractWalletAddress } from '../../lib/extract-wallet-address'
import { colors, spacing, textStyles, fontFamily } from '../../theme'
import { ripple } from '../../lib/androidRipple'
import { haptics } from '../../lib/haptics'

type WalletAddressQrScannerProps = {
  visible: boolean
  onClose: () => void
  onScan: (address: string) => void
}

type WalletAddressQrScannerContentProps = Pick<
  WalletAddressQrScannerProps,
  'visible' | 'onClose' | 'onScan'
> & {
  embedded?: boolean
  showHeader?: boolean
}

export function WalletAddressQrScannerContent({
  visible,
  onClose,
  onScan,
  embedded = false,
  showHeader = true,
}: WalletAddressQrScannerContentProps) {
  const insets = useSafeAreaInsets()
  const { width, height } = useWindowDimensions()
  const scanHandledRef = useRef(false)
  const frameSize = embedded
    ? Math.min(280, Math.max(220, Math.min(width * 0.62, height * 0.32)))
    : Math.min(320, Math.max(240, Math.min(width * 0.72, height * 0.42)))

  useEffect(() => {
    if (visible) {
      scanHandledRef.current = false
    }
  }, [visible])

  const handleBarcodeScanned = useCallback(
    ({ data }: { data: string }) => {
      if (scanHandledRef.current) return
      const address = extractWalletAddress(data)
      if (!address) return
      scanHandledRef.current = true
      haptics.success()
      onScan(address)
      onClose()
    },
    [onClose, onScan],
  )

  const [pasteValue, setPasteValue] = useState('')

  if (!visible) return null

  if (Platform.OS === 'web') {
    return (
      <View style={[styles.root, styles.webPasteRoot]}>
        <Text style={styles.webPasteTitle}>Paste wallet address</Text>
        <TextInput
          value={pasteValue}
          onChangeText={setPasteValue}
          placeholder="0x… or wallet address"
          autoCapitalize="none"
          autoCorrect={false}
          style={styles.webPasteInput}
          multiline
        />
        <Pressable
          style={styles.webPasteButton}
          onPressIn={() => haptics.tap()}
          onPress={() => {
            const address = extractWalletAddress(pasteValue.trim())
            if (!address) return
            haptics.success()
            onScan(address)
          }}
        >
          <Text style={styles.webPasteButtonText}>Use address</Text>
        </Pressable>
        {showHeader ? (
          <Pressable style={styles.closeButton} onPressIn={() => haptics.tap()} onPress={onClose}>
            <X size={22} color={colors.text.inverse} strokeWidth={2} />
          </Pressable>
        ) : null}
      </View>
    )
  }

  return (
    <View style={styles.root} collapsable={false}>
      <CameraView
        style={styles.camera}
        facing="back"
        active={visible}
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={visible ? handleBarcodeScanned : undefined}
      />

      <View style={styles.uiLayer} pointerEvents="box-none">
        {showHeader ? (
          <View style={[styles.header, { paddingTop: embedded ? spacing[5] : insets.top + spacing[4] }]}>
            <Text style={styles.title}>Scan wallet address</Text>
            <Pressable
              android_ripple={ripple.neutral}
              style={styles.closeButton}
              onPressIn={() => haptics.tap()}
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Close scanner"
            >
              <X size={22} color={colors.text.inverse} strokeWidth={2} />
            </Pressable>
          </View>
        ) : null}

        <View style={styles.centerGroup} pointerEvents="none">
          <View style={[styles.frame, { width: frameSize, height: frameSize }]} />
          <Text style={styles.hint}>Align QR code inside the frame</Text>
        </View>
      </View>
    </View>
  )
}

export function EmbeddedWalletAddressQrScanner({
  visible,
  onClose,
  onScan,
  showHeader = true,
}: WalletAddressQrScannerProps & { showHeader?: boolean }) {
  const { height } = useWindowDimensions()
  const [cameraPermission, requestCameraPermission] = useCameraPermissions()
  const panelHeight = Math.min(560, Math.max(420, height * 0.62))

  useEffect(() => {
    if (!visible || cameraPermission?.granted || cameraPermission == null) return
    void requestCameraPermission()
  }, [visible, cameraPermission, requestCameraPermission])

  if (!visible) return null

  return (
    <View style={[styles.embeddedHost, { height: panelHeight }]}>
      {cameraPermission?.granted ? (
        <WalletAddressQrScannerContent
          visible
          onClose={onClose}
          onScan={onScan}
          embedded
          showHeader={showHeader}
        />
      ) : (
        <View style={styles.permissionState}>
          <ActivityIndicator size="large" color={colors.primary.main} />
          <Text style={styles.permissionText}>Camera permission needed to scan wallet QR codes.</Text>
          <Pressable
            android_ripple={ripple.neutral}
            style={styles.permissionButton}
            onPress={() => {
              void requestCameraPermission()
            }}
            accessibilityRole="button"
            accessibilityLabel="Allow camera access"
          >
            <Text style={styles.permissionButtonText}>Allow camera</Text>
          </Pressable>
        </View>
      )}
    </View>
  )
}

export default function WalletAddressQrScanner({
  visible,
  onClose,
  onScan,
}: WalletAddressQrScannerProps) {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <WalletAddressQrScannerContent visible={visible} onClose={onClose} onScan={onScan} />
    </Modal>
  )
}

export const walletAddressQrScannerStyles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#000',
  },
  camera: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
  uiLayer: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    paddingHorizontal: spacing[6],
  },
  header: {
    position: 'absolute',
    left: spacing[6],
    right: spacing[6],
    top: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: spacing[4],
  },
  title: {
    ...textStyles.bodyLarge,
    color: colors.text.inverse,
    fontFamily: fontFamily.semibold,
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  centerGroup: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: spacing[12],
  },
  frame: {
    borderRadius: 18,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.9)',
    backgroundColor: 'transparent',
  },
  hint: {
    ...textStyles.bodySmall,
    color: colors.text.inverse,
    textAlign: 'center',
    marginTop: spacing[3],
  },
  embeddedHost: {
    overflow: 'hidden',
    backgroundColor: '#000',
    flexShrink: 0,
  },
  permissionState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[4],
    paddingHorizontal: spacing[6],
    backgroundColor: '#000',
  },
  permissionText: {
    ...textStyles.bodySmall,
    color: colors.text.inverse,
    textAlign: 'center',
  },
  permissionButton: {
    minHeight: 44,
    paddingHorizontal: spacing[5],
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary.main,
  },
  permissionButtonText: {
    ...textStyles.bodySmall,
    color: colors.text.inverse,
    fontFamily: fontFamily.semibold,
  },
  webPasteRoot: {
    padding: spacing[6],
    justifyContent: 'center',
    backgroundColor: colors.background.primary,
  },
  webPasteTitle: {
    ...textStyles.titleMedium,
    color: colors.text.primary,
    marginBottom: spacing[3],
  },
  webPasteInput: {
    minHeight: 100,
    borderWidth: 1,
    borderColor: colors.semantic.border,
    borderRadius: spacing[3],
    padding: spacing[4],
    ...textStyles.bodyMedium,
    color: colors.text.primary,
    backgroundColor: colors.semantic.card,
    marginBottom: spacing[4],
    ...Platform.select({
      web: { outlineStyle: 'none' },
      default: {},
    }),
  },
  webPasteButton: {
    backgroundColor: colors.primary.main,
    borderRadius: spacing[4],
    paddingVertical: spacing[4],
    alignItems: 'center',
  },
  webPasteButtonText: {
    ...textStyles.titleMedium,
    color: colors.text.inverse,
    fontWeight: '600',
  },
})

const styles = walletAddressQrScannerStyles

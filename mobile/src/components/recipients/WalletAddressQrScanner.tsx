import React, { useCallback, useEffect, useRef } from 'react'
import { Modal, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native'
import { CameraView } from 'expo-camera'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { X } from 'lucide-react-native'
import { extractWalletAddress } from '../../lib/extract-wallet-address'
import { colors, spacing, textStyles, fontFamily } from '../../theme'
import { ripple } from '../../lib/androidRipple'

type WalletAddressQrScannerProps = {
  visible: boolean
  onClose: () => void
  onScan: (address: string) => void
}

export function WalletAddressQrScannerContent({
  visible,
  onClose,
  onScan,
}: Pick<WalletAddressQrScannerProps, 'visible' | 'onClose' | 'onScan'>) {
  const insets = useSafeAreaInsets()
  const { width, height } = useWindowDimensions()
  const scanHandledRef = useRef(false)
  const frameSize = Math.min(320, Math.max(240, Math.min(width * 0.72, height * 0.42)))

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
      onScan(address)
      onClose()
    },
    [onClose, onScan],
  )

  if (!visible) return null

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
        <View style={[styles.header, { paddingTop: insets.top + spacing[4] }]}>
          <Text style={styles.title}>Scan wallet address</Text>
          <Pressable
            android_ripple={ripple.neutral}
            style={styles.closeButton}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close scanner"
          >
            <X size={22} color={colors.text.inverse} strokeWidth={2} />
          </Pressable>
        </View>

        <View style={styles.centerGroup} pointerEvents="none">
          <View style={[styles.frame, { width: frameSize, height: frameSize }]} />
          <Text style={styles.hint}>Align QR code inside the frame</Text>
        </View>
      </View>
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
})

const styles = walletAddressQrScannerStyles

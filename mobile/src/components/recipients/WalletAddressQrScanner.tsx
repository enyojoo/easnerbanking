import React, { useCallback, useEffect, useRef } from 'react'
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native'
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
  const scanHandledRef = useRef(false)

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
          <View style={styles.frame} />
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
    flex: 1,
    width: '100%',
    height: '100%',
  },
  uiLayer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-start',
    alignItems: 'center',
    paddingHorizontal: spacing[6],
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
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
    marginTop: spacing[16],
    alignItems: 'center',
  },
  frame: {
    width: 260,
    height: 260,
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

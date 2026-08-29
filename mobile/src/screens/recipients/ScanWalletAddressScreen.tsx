import React, { useCallback, useEffect } from 'react'
import { ActivityIndicator, StatusBar, StyleSheet, View } from 'react-native'
import { useCameraPermissions } from 'expo-camera'
import { CommonActions } from '@react-navigation/native'
import { WalletAddressQrScannerContent } from '../../components/recipients/WalletAddressQrScanner'
import { NavigationProps } from '../../types'
import { colors } from '../../theme'
import { useToast } from '../../components/ToastProvider'
import { haptics } from '../../lib/haptics'

/**
 * Full-screen stack route for QR scan. Camera preview must live on this screen
 * directly (no nested RN Modal) or Android often shows a black preview while
 * the OS camera indicator is active.
 */
export default function ScanWalletAddressScreen({ navigation }: NavigationProps) {
  const { showWarning } = useToast()
  const [cameraPermission, requestCameraPermission] = useCameraPermissions()

  useEffect(() => {
    if (cameraPermission?.granted) return
    if (cameraPermission == null) return

    void (async () => {
      const perm = await requestCameraPermission()
      if (!perm.granted) {
        showWarning(
          'Camera permission needed. Enable camera access in Settings to scan wallet QR codes.',
        )
        navigation.goBack()
      }
    })()
  }, [cameraPermission, requestCameraPermission, navigation, showWarning])

  const handleClose = useCallback(() => {
    haptics.tap()
    navigation.goBack()
  }, [navigation])

  const handleScan = useCallback(
    (address: string) => {
      haptics.success()
      const state = navigation.getState()
      const routes = state?.routes
      if (!routes || routes.length < 2) {
        navigation.goBack()
        return
      }
      const prevRoute = routes[routes.length - 2]
      navigation.dispatch(
        CommonActions.setParams({
          key: prevRoute.key,
          params: { scannedWalletAddress: address },
        }),
      )
      navigation.goBack()
    },
    [navigation],
  )

  if (!cameraPermission?.granted) {
    return (
      <View style={styles.root}>
        <StatusBar barStyle="light-content" backgroundColor="#000" />
        <View style={styles.loading}>
          <ActivityIndicator size="large" color={colors.primary.main} />
        </View>
      </View>
    )
  }

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor="#000" />
      <WalletAddressQrScannerContent visible onClose={handleClose} onScan={handleScan} />
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#000',
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
})

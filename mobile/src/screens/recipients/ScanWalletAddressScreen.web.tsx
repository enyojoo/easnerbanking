import { useLayoutEffect } from 'react'
import { NavigationProps } from '../../types'

/**
 * Camera QR scan is iOS/Android only. Web paste lives on the wallet form
 * (address field + asset/network inference). Deep links to this route go back.
 */
export default function ScanWalletAddressScreen({ navigation }: NavigationProps) {
  useLayoutEffect(() => {
    if (navigation.canGoBack()) navigation.goBack()
  }, [navigation])
  return null
}

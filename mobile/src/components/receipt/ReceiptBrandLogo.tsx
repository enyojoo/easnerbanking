import React from 'react'
import { Image } from 'react-native'
import { RECEIPT_LOGO_HEIGHT, RECEIPT_LOGO_WIDTH } from './receipt-brand-logo-metrics'

/** Native: bundled wordmark at the correct aspect ratio for sharp view-shot capture. */
export default function ReceiptBrandLogo() {
  return (
    <Image
      source={require('../../../assets/icons/logo.png')}
      style={{ width: RECEIPT_LOGO_WIDTH, height: RECEIPT_LOGO_HEIGHT }}
      resizeMode="contain"
    />
  )
}

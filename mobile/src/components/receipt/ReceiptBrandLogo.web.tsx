import React from 'react'
import { PixelRatio } from 'react-native'
import { unstable_createElement } from 'react-native-web'
import { RECEIPT_LOGO_HEIGHT, RECEIPT_LOGO_WIDTH } from './receipt-brand-logo-metrics'

const logoSource = require('../../../assets/icons/logo.png')

function resolveWebLogoUri(source: unknown): string {
  if (typeof source === 'string') return source
  if (source && typeof source === 'object' && 'uri' in source) {
    const uri = (source as { uri?: string }).uri
    if (typeof uri === 'string') return uri
  }
  if (typeof source === 'number') {
    const { getAssetByID } = require('react-native-web/dist/modules/AssetRegistry') as {
      getAssetByID: (id: number) => {
        httpServerLocation: string
        name: string
        type: string
        scales: number[]
      } | undefined
    }
    const asset = getAssetByID(source)
    if (!asset) throw new Error('Easner logo asset not found')
    let scale = asset.scales[0]
    if (asset.scales.length > 1) {
      const preferredScale = PixelRatio.get()
      scale = asset.scales.reduce((prev, curr) =>
        Math.abs(curr - preferredScale) < Math.abs(prev - preferredScale) ? curr : prev,
      )
    }
    const scaleSuffix = scale !== 1 ? `@${scale}x` : ''
    return `${asset.httpServerLocation}/${asset.name}${scaleSuffix}.${asset.type}`
  }
  throw new Error('Unsupported Easner logo asset')
}

/**
 * Web: real <img> at the logo's native aspect ratio. html2canvas often ignores
 * object-fit and stretches into a mismatched box (80×24 on a 4.6:1 wordmark).
 */
export default function ReceiptBrandLogo() {
  const src = resolveWebLogoUri(logoSource)
  return unstable_createElement('img', {
    src,
    alt: 'Easner',
    style: {
      width: RECEIPT_LOGO_WIDTH,
      height: RECEIPT_LOGO_HEIGHT,
      display: 'block',
    },
  })
}

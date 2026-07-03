import React from 'react'
import { PixelRatio } from 'react-native'
import { unstable_createElement } from 'react-native-web'

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
 * Web: react-native-web renders <Image> as a CSS background-image, which html2canvas
 * rasterizes at low resolution (blurry logo) even at high capture scale. A real <img>
 * element is captured at full scale, so the receipt logo stays crisp on download/share.
 */
export default function ReceiptBrandLogo() {
  const src = resolveWebLogoUri(logoSource)
  return unstable_createElement('img', {
    src,
    alt: 'Easner',
    style: { width: 80, height: 24, objectFit: 'contain' },
  })
}

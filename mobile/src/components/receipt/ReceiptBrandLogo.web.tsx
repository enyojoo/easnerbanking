import { Image } from 'react-native'
import { unstable_createElement } from 'react-native-web'

const LOGO_URI = Image.resolveAssetSource(require('../../../assets/icons/logo.png')).uri

/**
 * Web: react-native-web renders <Image> as a CSS background-image, which html2canvas
 * rasterizes at low resolution (blurry logo) even at high capture scale. A real <img>
 * element is captured at full scale, so the receipt logo stays crisp on download/share.
 */
export default function ReceiptBrandLogo() {
  return unstable_createElement('img', {
    src: LOGO_URI,
    alt: 'Easner',
    style: { width: 80, height: 24, objectFit: 'contain' },
  })
}

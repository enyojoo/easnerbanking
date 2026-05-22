import { Image, type ImageProps, type ImageStyle, type StyleProp } from 'react-native'

type Props = Omit<ImageProps, 'source'> & {
  /** Metro `require()` asset id */
  source: number
  style?: StyleProp<ImageStyle>
}

/**
 * Local bundled PNG/SVG raster assets. Uses react-native `Image` — reliable in release
 * builds (expo-image + cachePolicy often fails on `require()` sources).
 */
export function BundledImage({ source, resizeMode = 'cover', ...rest }: Props) {
  return <Image source={source} resizeMode={resizeMode} {...rest} />
}

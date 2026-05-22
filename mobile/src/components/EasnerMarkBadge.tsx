import { View, StyleSheet } from 'react-native'
import { EASNER_MARK_SOURCE } from '../lib/easnerBrand'
import { colors } from '../theme'
import { BundledImage } from './BundledImage'

const BADGE_SIZE = 20

type Props = {
  size?: number
}

/** Easetag / in-network avatar corner mark (bundled PNG, explicit size). */
export function EasnerMarkBadge({ size = BADGE_SIZE }: Props) {
  const radius = size / 2
  return (
    <View
      style={[
        styles.badge,
        {
          width: size,
          height: size,
          borderRadius: radius,
        },
      ]}
    >
      <BundledImage
        source={EASNER_MARK_SOURCE}
        style={{ width: size, height: size, borderRadius: radius }}
        resizeMode="cover"
      />
    </View>
  )
}

const styles = StyleSheet.create({
  badge: {
    overflow: 'hidden',
    backgroundColor: colors.background.primary,
    borderWidth: 2,
    borderColor: colors.background.primary,
  },
})

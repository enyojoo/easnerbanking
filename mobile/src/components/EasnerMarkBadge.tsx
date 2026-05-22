import { View, StyleSheet, Image } from 'react-native'
import { colors } from '../theme'
import { EASNER_MARK_SOURCE } from '../lib/easnerBrand'

const BADGE_SIZE = 20

type Props = {
  size?: number
}

/** Corner badge on Easetag recipient avatars (bundled easner-mark.png). */
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
      <Image
        source={EASNER_MARK_SOURCE}
        style={{ width: size, height: size }}
        resizeMode="contain"
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
    justifyContent: 'center',
    alignItems: 'center',
  },
})

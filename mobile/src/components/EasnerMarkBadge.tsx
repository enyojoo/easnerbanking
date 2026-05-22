import { View, StyleSheet, Image } from 'react-native'
import { colors } from '../theme'

const EASNER_MARK_BADGE = require('../../assets/easner-mark.png')

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
        source={EASNER_MARK_BADGE}
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
    justifyContent: 'center',
    alignItems: 'center',
  },
})

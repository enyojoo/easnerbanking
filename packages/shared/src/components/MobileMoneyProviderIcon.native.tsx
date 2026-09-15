import { Image } from "expo-image"
import { StyleSheet, Text, View, type ImageStyle, type StyleProp, type ViewStyle } from "react-native"
import { MOBILE_MONEY_ICON_ASSETS } from "../mobile-money-assets.manifest"
import {
  hasMobileMoneyProviderIcon,
  normalizeMobileMoneyProviderKey,
} from "../mobile-money-icons"

export type MobileMoneyProviderIconProps = {
  provider: string
  size?: number
  style?: StyleProp<ViewStyle>
  title?: string
}

export function MobileMoneyProviderIcon({
  provider,
  size = 18,
  style,
  title,
}: MobileMoneyProviderIconProps) {
  const key = normalizeMobileMoneyProviderKey(provider)
  const source = key ? MOBILE_MONEY_ICON_ASSETS[key] : undefined

  if (!source) {
    return (
      <View
        style={[
          styles.fallback,
          { width: size, height: size, borderRadius: size / 2 },
          style,
        ]}
        accessibilityLabel={title ?? provider}
      >
        <Text style={[styles.fallbackText, { fontSize: Math.max(8, size * 0.38) }]}>
          {(key ?? provider).slice(0, 2).toUpperCase()}
        </Text>
      </View>
    )
  }

  return (
    <Image
      source={source}
      recyclingKey={key}
      style={[{ width: size, height: size, borderRadius: size / 2 }, style as StyleProp<ImageStyle>]}
      contentFit="cover"
      cachePolicy="memory-disk"
      transition={0}
      accessibilityLabel={title ?? provider}
    />
  )
}

const styles = StyleSheet.create({
  fallback: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#E2E8F0",
  },
  fallbackText: {
    fontWeight: "700",
    color: "#64748B",
  },
})

export { hasMobileMoneyProviderIcon, normalizeMobileMoneyProviderKey }

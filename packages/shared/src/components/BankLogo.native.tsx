import { Image } from "expo-image"
import { StyleSheet, Text, View, type ImageStyle, type StyleProp, type ViewStyle } from "react-native"
import { BANK_LOGO_ASSETS } from "../bank-assets.manifest"
import { normalizeBankLogoKey } from "../bank-icons"

export type BankLogoProps = {
  bankName: string
  size?: number
  style?: StyleProp<ViewStyle>
  title?: string
}

export function BankLogo({ bankName, size = 18, style, title }: BankLogoProps) {
  const key = normalizeBankLogoKey(bankName)
  const source = key ? BANK_LOGO_ASSETS[key] : undefined

  if (!source) {
    return (
      <View
        style={[
          styles.fallback,
          { width: size, height: size, borderRadius: size / 2 },
          style,
        ]}
        accessibilityLabel={title ?? bankName}
      >
        <Text style={[styles.fallbackText, { fontSize: Math.max(8, size * 0.38) }]}>
          {(key ?? bankName).slice(0, 2).toUpperCase()}
        </Text>
      </View>
    )
  }

  return (
    <Image
      source={source}
      recyclingKey={key}
      style={[{ width: size, height: size, borderRadius: size / 2, backgroundColor: "#fff" }, style as StyleProp<ImageStyle>]}
      contentFit="cover"
      cachePolicy="memory-disk"
      transition={0}
      accessibilityLabel={title ?? bankName}
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

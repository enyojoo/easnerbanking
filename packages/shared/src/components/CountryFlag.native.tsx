import React from "react"
import { Image } from "expo-image"
import type { ImageStyle, StyleProp, ViewStyle } from "react-native"
import { StyleSheet, Text, View } from "react-native"
import { getCountryCodeForCurrency } from "../flags/currency-mapping"
import { FLAG_ASSETS } from "../flags/flag-assets.manifest"
import { flagIsoForCurrency, normalizeFlagIso } from "../flags/flag-source"

export type CountryFlagProps = {
  code: string
  size?: number
  className?: string
  style?: StyleProp<ImageStyle>
  title?: string
}

function flagSource(iso: string) {
  const upper = normalizeFlagIso(iso)
  return upper.length === 2 ? FLAG_ASSETS[upper] : undefined
}

export function CountryFlag({ code, size = 20, style }: CountryFlagProps) {
  const upper = normalizeFlagIso(code)
  const source = flagSource(upper)
  const height = Math.round(size * 0.75)

  if (!source) {
    return (
      <View style={[styles.fallback, { width: size, height }, style as ViewStyle]}>
        <Text style={styles.fallbackText}>{upper.slice(0, 2) || "--"}</Text>
      </View>
    )
  }

  return (
    <Image
      source={source}
      style={[{ width: size, height, borderRadius: 4 }, style]}
      contentFit="cover"
    />
  )
}

export type CurrencyFlagProps = {
  currency: string
  size?: number
  className?: string
  style?: StyleProp<ImageStyle>
  title?: string
  fallbackSvg?: string | null
}

export function CurrencyFlag({ currency, size = 20, style }: CurrencyFlagProps) {
  const code = String(currency || "").trim().toUpperCase()
  const iso = flagIsoForCurrency(code) || getCountryCodeForCurrency(code) || ""
  if (iso && flagSource(iso)) {
    return <CountryFlag code={iso} size={size} style={style} />
  }
  const height = Math.round(size * 0.75)
  return (
    <View style={[styles.fallback, { width: size, height }, style as ViewStyle]}>
      <Text style={styles.fallbackText}>{code.slice(0, 2) || "--"}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  fallback: {
    borderRadius: 4,
    backgroundColor: "rgba(0,0,0,0.06)",
    alignItems: "center",
    justifyContent: "center",
  },
  fallbackText: {
    fontSize: 10,
    color: "#6b7280",
    fontWeight: "600",
  },
})

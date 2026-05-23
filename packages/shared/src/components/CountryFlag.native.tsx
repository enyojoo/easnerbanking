import React from "react"
import { Image } from "expo-image"
import type { ImageStyle, StyleProp, ViewStyle } from "react-native"
import { StyleSheet, Text, View } from "react-native"
import { getTokenIconUrl } from "../crypto-icons"
import { getCountryCodeForCurrency } from "../flags/currency-mapping"
import { FLAG_ASSETS } from "../flags/flag-assets.manifest"
import { flagIsoForCurrency, normalizeFlagIso } from "../flags/flag-source"
import { FLAG_BORDER_RADIUS_PX, resolveFlagBoxSizeFromStyle } from "../flags/flag-styles"

export type CountryFlagProps = {
  code: string
  /** Flag width in px (height = 2/3 × width, 3:2). */
  size?: number
  className?: string
  style?: StyleProp<ImageStyle>
  title?: string
  /** `contain` fits full flag in badge circles; default `cover` fills currency circles. */
  contentFit?: "cover" | "contain"
}

function flagSource(iso: string) {
  const upper = normalizeFlagIso(iso)
  return upper.length === 2 ? FLAG_ASSETS[upper] : undefined
}

export function CountryFlag({ code, size = 20, style, contentFit = "cover" }: CountryFlagProps) {
  const upper = normalizeFlagIso(code)
  const source = flagSource(upper)
  const flat = StyleSheet.flatten(style) ?? {}
  const { width, height } = resolveFlagBoxSizeFromStyle(size, flat)
  const shellStyle: ViewStyle = {
    width,
    height,
    borderRadius: FLAG_BORDER_RADIUS_PX,
    overflow: "hidden",
  }

  if (!source) {
    return (
      <View style={[styles.fallback, shellStyle, style as ViewStyle]}>
        <Text style={styles.fallbackText}>{upper.slice(0, 2) || "--"}</Text>
      </View>
    )
  }

  return (
    <View style={[shellStyle, style as ViewStyle]}>
      <Image
        source={source}
        recyclingKey={upper}
        style={StyleSheet.absoluteFill}
        contentFit={contentFit}
        contentPosition="center"
        cachePolicy="memory-disk"
        transition={0}
      />
    </View>
  )
}

export type CurrencyFlagProps = {
  currency: string
  size?: number
  className?: string
  style?: StyleProp<ImageStyle>
  title?: string
  fallbackSvg?: string | null
  contentFit?: "cover" | "contain"
}

export function CurrencyFlag({
  currency,
  size = 20,
  style,
  contentFit = "cover",
  fallbackSvg,
}: CurrencyFlagProps) {
  const code = String(currency || "").trim().toUpperCase()
  const iso = flagIsoForCurrency(code) || getCountryCodeForCurrency(code) || ""
  if (iso && flagSource(iso)) {
    return <CountryFlag code={iso} size={size} style={style} contentFit={contentFit} />
  }

  const tokenIconUrl = getTokenIconUrl(code)
  const flat = StyleSheet.flatten(style) ?? {}
  const tokenSide = typeof size === "number" ? size : Number.parseInt(String(size), 10) || 20
  const { width, height } = resolveFlagBoxSizeFromStyle(size, flat)
  const tokenShell: ViewStyle = {
    width: tokenSide,
    height: tokenSide,
    borderRadius: 0,
    overflow: "hidden",
  }

  if (tokenIconUrl) {
    return (
      <View style={[tokenShell, style as ViewStyle]}>
        <Image
          source={{ uri: tokenIconUrl }}
          recyclingKey={code}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          contentPosition="center"
          cachePolicy="memory-disk"
          transition={0}
        />
      </View>
    )
  }

  return (
    <View style={[styles.fallback, { width, height, borderRadius: FLAG_BORDER_RADIUS_PX }, style as ViewStyle]}>
      <Text style={styles.fallbackText}>{code.slice(0, 2) || "--"}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  fallback: {
    alignItems: "center",
    justifyContent: "center",
  },
  fallbackText: {
    fontSize: 10,
    color: "#6b7280",
    fontWeight: "600",
  },
})

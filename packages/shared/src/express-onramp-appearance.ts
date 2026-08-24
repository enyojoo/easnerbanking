/**
 * Appearance / branding for Stripe Embedded Components crypto onramp
 * (Express deposits).
 *
 * Native: `configure({ merchantDisplayName, appearance })` affects Link OTP,
 * identity, and payment sheets.
 *
 * Web: init `variables` affect payment/KYC chrome where supported. The Link
 * identity consent popup ("Verify your identity with Link") is a separate
 * product from the Dashboard Identity preview ("Easner works with Stripe").
 * Merchant icon/co-brand on web also depends on LinkAuthIntent
 * `data_sharing_merchant` plus Dashboard → Branding → Identity tab.
 */

import { BRAND } from "./constants/brand"
import { easnerBrand, fontFamilies } from "./design/tokens"

export const EXPRESS_ONRAMP_MERCHANT_NAME = BRAND.name

/** Bump when appearance changes so web clients re-init the CDN SDK. */
export const EXPRESS_ONRAMP_APPEARANCE_REV = "3"

/** Web: `loadCryptoOnrampAndInitialize(pk, options)` */
export function expressOnrampWebInitOptions() {
  return {
    theme: "stripe" as const,
    variables: {
      colorPrimary: easnerBrand.primary,
      colorBackground: easnerBrand.cloud,
      colorText: easnerBrand.graphite,
      colorTextSecondary: easnerBrand.slate,
      colorDanger: easnerBrand.oxblood,
      colorSuccess: easnerBrand.emerald,
      buttonColorBackground: easnerBrand.primary,
      buttonColorText: "#FFFFFF",
      accessibleColorOnColorPrimary: "#FFFFFF",
      iconColor: easnerBrand.primary,
      iconCheckmarkColor: easnerBrand.emerald,
      logoColor: easnerBrand.primary,
      tabLogoSelectedColor: easnerBrand.primary,
      fontFamily: fontFamilies.sans.join(", "),
      borderRadius: "12px",
      buttonBorderRadius: "9999px",
    },
  }
}

/** Optional web/native configure payload when the SDK exposes `configure()`. */
export function expressOnrampLinkConfigure(cryptoCustomerId?: string | null) {
  const id = String(cryptoCustomerId || "").trim()
  return {
    merchantDisplayName: EXPRESS_ONRAMP_MERCHANT_NAME,
    appearance: expressOnrampNativeAppearance(),
    ...(id ? { cryptoCustomerId: id } : {}),
  }
}

/** Native RN: `configure({ merchantDisplayName, appearance, googlePay })` */
export function expressOnrampNativeAppearance() {
  return {
    style: "ALWAYS_LIGHT" as const,
    lightColors: {
      primary: easnerBrand.primary,
      contentOnPrimary: "#FFFFFF",
      borderSelected: easnerBrand.primary,
    },
    primaryButton: {
      cornerRadius: 24,
      height: 48,
    },
  }
}

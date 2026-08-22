/**
 * Appearance / branding for Stripe Embedded Components crypto onramp
 * (Express deposits). Applies to Stripe-hosted sheets (auth, identity, PM)
 * where the SDK allows customization. Icon/logo still come from Dashboard
 * Branding settings — not passable via the web SDK.
 */

import { BRAND } from "./constants/brand"
import { easnerBrand, fontFamilies } from "./design/tokens"

export const EXPRESS_ONRAMP_MERCHANT_NAME = BRAND.name

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

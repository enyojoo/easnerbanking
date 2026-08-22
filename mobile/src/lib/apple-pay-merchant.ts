import Constants from "expo-constants"

/** Apple Merchant ID for native Apple Pay (StripeProvider). Not MoR — Apple sheet only. */
export function getApplePayMerchantId(): string {
  const fromExtra = Constants.expoConfig?.extra?.applePayMerchantId
  if (typeof fromExtra === "string" && fromExtra.trim()) return fromExtra.trim()
  return process.env.EXPO_PUBLIC_APPLE_PAY_MERCHANT_ID?.trim() || "merchant.com.easner.mobile"
}

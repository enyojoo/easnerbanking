export const ANALYTICS_PLATFORM = {
  businessWeb: "business_web",
  consumerIos: "consumer_ios",
  consumerAndroid: "consumer_android",
  consumerWeb: "consumer_web",
  payerWeb: "payer_web",
} as const

export type AnalyticsPlatform = (typeof ANALYTICS_PLATFORM)[keyof typeof ANALYTICS_PLATFORM]

export const ANALYTICS_SURFACE = {
  operator: "operator",
  payer: "payer",
} as const

export type AnalyticsSurface = (typeof ANALYTICS_SURFACE)[keyof typeof ANALYTICS_SURFACE]

export function consumerPlatformFromOs(os: "ios" | "android" | "web" | string): AnalyticsPlatform {
  if (os === "ios") return ANALYTICS_PLATFORM.consumerIos
  if (os === "android") return ANALYTICS_PLATFORM.consumerAndroid
  return ANALYTICS_PLATFORM.consumerWeb
}

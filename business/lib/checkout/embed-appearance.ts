import type { Appearance } from "@stripe/stripe-js"
import { easnerStripeElementsAppearance } from "@/lib/stripe/elements-appearance"

/**
 * Merchant branding for the website embed, stored in
 * `business_checkout_settings.appearance` and applied to every mount of the SDK –
 * the dashboard is the source of truth, so a merchant styles checkout once.
 */
export type CheckoutBranding = {
  /** Accent for the pay button, focus rings and selected states (#rrggbb). */
  brandColor: string | null
  /** pill = fully rounded controls (Easner default), rounded = 8px corners. */
  buttonRadius: "pill" | "rounded"
}

export const DEFAULT_CHECKOUT_BRANDING: CheckoutBranding = {
  brandColor: null,
  buttonRadius: "pill",
}

export function parseBrandColor(raw: unknown): string | null {
  const value = String(raw ?? "").trim()
  return /^#[0-9a-fA-F]{6}$/.test(value) ? value.toLowerCase() : null
}

export function parseCheckoutBranding(raw: unknown): CheckoutBranding {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return DEFAULT_CHECKOUT_BRANDING
  const record = raw as Record<string, unknown>
  const radius = String(record.buttonRadius ?? "").trim()
  return {
    brandColor: parseBrandColor(record.brandColor),
    buttonRadius: radius === "rounded" ? "rounded" : "pill",
  }
}

/** Stripe Elements appearance for the embed: Easner defaults + merchant branding. */
export function buildEmbedAppearance(branding: CheckoutBranding): Appearance {
  const appearance = easnerStripeElementsAppearance()
  const variables = { ...(appearance.variables ?? {}) }
  if (branding.brandColor) {
    variables.colorPrimary = branding.brandColor
  }
  if (branding.buttonRadius === "rounded") {
    variables.borderRadius = "10px"
    variables.buttonBorderRadius = "10px"
    variables.buttonExpressCheckoutBorderRadius = "10px"
  }
  return { ...appearance, variables }
}

/** Concrete styles the SDK applies to the controls it renders itself. */
export function buildEmbedButtonStyle(branding: CheckoutBranding): {
  background: string
  color: string
  radius: string
} {
  return {
    background: branding.brandColor ?? "#0080cc",
    color: "#ffffff",
    radius: branding.buttonRadius === "rounded" ? "10px" : "9999px",
  }
}

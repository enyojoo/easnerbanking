import type { SeoPageContent } from "@/lib/seo/content/auth"

export const payCustomerSeo = {
  publicDefault: {
    metadata: {
      title: "Pay | Easner Business Banking",
      description:
        "Pay a business securely by card, bank, or stablecoin from a link they shared with you – powered by Easner Business.",
      keywords: ["payment link", "pay a business", "easner business"],
    },
    hero: {
      h1: "Pay",
      subhead: "Pay securely from a link a business shared with you.",
      altText: "Pay a business with Easner",
    },
  },
  thanks: {
    metadata: {
      title: "Payment complete | Easner Business Banking",
      description:
        "Your payment is complete. A receipt is on its way and the business has been notified – powered by Easner Business.",
    },
    hero: {
      h1: "Payment complete",
      subhead: "Your payment went through.",
      altText: "Payment complete",
    },
  },
} as const satisfies Record<string, SeoPageContent>

export function paymentLinkPublicMetadata(businessName: string) {
  const name = businessName.trim() || "a business"
  return {
    metadata: {
      title: `Pay ${name} | Easner Business Banking`,
      description: `Pay ${name} securely by card, bank, or stablecoin – review the amount and complete your payment on Easner Business.`,
    },
    hero: {
      h1: "Pay",
      subhead: `Pay ${name}`,
      altText: `Pay ${name}`,
    },
  }
}

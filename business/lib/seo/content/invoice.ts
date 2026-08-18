import type { SeoPageContent } from "@/lib/seo/content/auth"

export const invoiceSeo = {
  publicDefault: {
    metadata: {
      title: "Invoice | Easner Business Banking",
      description: "View your invoice and payment options, review amounts and due dates, and pay securely through Easner Business – built for modern finance teams and operators.",
      keywords: ["invoice", "pay invoice", "easner business"],
    },
    hero: {
      h1: "Invoice",
      subhead: "View your invoice and payment options.",
      altText: "View your invoice",
    },
  },
} as const satisfies Record<string, SeoPageContent>

export function invoicePublicMetadata(businessName: string) {
  const name = businessName.trim() || "Your Business"
  return {
    metadata: {
      title: `Invoice from ${name} | Easner Business Banking`,
      description: `View your invoice from ${name} – review the amount, due date, and available payment options on Easner Business today.`,
    },
    hero: {
      h1: `Invoice from ${name}`,
      subhead: "View your invoice and payment options.",
      altText: `Invoice from ${name}`,
    },
    ogHeadline: ["Invoice from", name] as const,
  }
}

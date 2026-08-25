const MAX_SLUG_LENGTH = 40

/** URL segment on pay.easner.com/{easetag}/{slug} – lowercase, hyphenated, no reserved words. */
export function normalizePaymentLinkSlug(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_SLUG_LENGTH)
    .replace(/-+$/, "")
}

/** `thanks` and `plink_…` are taken by the pay host itself. */
const RESERVED_SLUGS = new Set(["thanks", "api", "checkout", "invoice", "pay", "static"])

export function validatePaymentLinkSlug(slug: string): { valid: boolean; error?: string } {
  if (!slug) return { valid: false, error: "Add a link name" }
  if (slug.length < 3) return { valid: false, error: "Link name must be at least 3 characters" }
  if (RESERVED_SLUGS.has(slug)) return { valid: false, error: "This link name is reserved" }
  if (slug.startsWith("plink_")) return { valid: false, error: "This link name is reserved" }
  return { valid: true }
}

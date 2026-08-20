/** Public Easner mark – badge for Easetag / in-network recipients (same-origin for HTTP cache) */
export const EASNER_MARK_URL = "/easner-mark.png"

export type PayeeAccountKind = "business" | "personal"

export function formatEasenetRecipientSubtitle(
  easetag: string | undefined | null,
  accountKind?: PayeeAccountKind | null,
): string {
  const tag = String(easetag || "")
    .trim()
    .replace(/^@+/, "")
    .toLowerCase()
  if (!tag) return ""
  const label = accountKind === "business" ? "Business" : "Personal"
  return `${label} • @${tag}`
}

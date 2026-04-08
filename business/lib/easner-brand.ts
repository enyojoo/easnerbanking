/** Public Easner mark — badge for Easetag / in-network recipients */
export const EASNER_MARK_URL =
  "https://kixymrjsupzkxokujmwu.supabase.co/storage/v1/object/public/brand/Easner%20mark.png"

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

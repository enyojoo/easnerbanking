import { getIndustryLabelForProfileValue } from "@easner/shared"

/** Human-readable label for `public.businesses.business_type` (catalog id or fallback). */
export function businessTypeDisplayText(raw: string | null | undefined): string {
  const label = getIndustryLabelForProfileValue(raw)
  if (label) return label
  const s = raw?.trim()
  if (!s) return "—"
  return s
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

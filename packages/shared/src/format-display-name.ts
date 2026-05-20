/**
 * Title-case person / company display names (Noah ACH often sends ALL CAPS).
 * Same rules as business profile normalization on Noah customer write.
 */

function titleCaseWord(word: string): string {
  if (!word) return word
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
}

/** "JANE Q PUBLIC" → "Jane Q Public"; preserves hyphens and apostrophes. */
export function formatDisplayPersonName(input: string | null | undefined): string {
  const raw = String(input ?? "").trim()
  if (!raw) return ""
  return raw
    .split(/\s+/)
    .map((part) =>
      part
        .split(/([-'])/)
        .map((seg) => (seg === "-" || seg === "'" ? seg : titleCaseWord(seg)))
        .join(""),
    )
    .join(" ")
}

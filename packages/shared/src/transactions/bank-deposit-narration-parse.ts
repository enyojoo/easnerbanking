/**
 * Leaf narration parser — no imports from verification/inbound label modules
 * (those previously formed a circular dependency).
 */

import { formatDisplayPersonName } from "../format-display-name"

/** e.g. "ACH … Sent from Sent from Grey" → "Sent from Grey" */
export function parseSentFromNarrationLabel(text: string | null | undefined): string | null {
  const raw = String(text ?? "").trim()
  if (!raw) return null
  const parts = raw.split(/\bsent\s+from\s+/i)
  if (parts.length < 2) return null
  const origin = parts[parts.length - 1]!.trim()
  if (!origin) return null
  const label = formatDisplayPersonName(origin)
  return label ? `Sent from ${label}` : null
}

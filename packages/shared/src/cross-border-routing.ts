export type CrossBorderProviderId = "yellowcard" | "grid"

export function parseCrossBorderProvider(metadata: unknown): CrossBorderProviderId | null {
  const meta = (metadata ?? {}) as Record<string, unknown>
  const raw = String(meta.cross_border_provider ?? "")
    .trim()
    .toLowerCase()
  if (raw === "grid") return "grid"
  if (raw === "yellowcard" || raw === "yc") return "yellowcard"
  return null
}

/** Default when Office has not set `cross_border_provider` on the destination corridor. */
export function defaultCrossBorderProvider(input: {
  supportYellowcard: boolean
  supportGrid: boolean
}): CrossBorderProviderId | null {
  if (input.supportYellowcard && input.supportGrid) return "yellowcard"
  if (input.supportGrid) return "grid"
  if (input.supportYellowcard) return "yellowcard"
  return null
}

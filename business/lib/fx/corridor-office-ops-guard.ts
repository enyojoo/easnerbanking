import { mergeCorridorMetadataSurfaces, readCorridorSurfacesMap } from "@easner/shared"

/** Helpers to keep provider provision sync from undoing Office corridor configuration. */

export function corridorMetadataRecord(metadata: unknown): Record<string, unknown> {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return {}
  return { ...(metadata as Record<string, unknown>) }
}

/** Grid discovery capability – never touches Office *_enabled flags or routing. */
export function mergeGridCapabilityMetadataForSync(existing: unknown): Record<string, unknown> {
  const meta = corridorMetadataRecord(existing)
  meta.grid_send = true
  meta.grid_receive = true
  return mergeCorridorMetadataSurfaces(meta, existing)
}

/** Yellowcard channel capability – never touches Office *_enabled flags or routing. */
export function mergeYcCapabilityMetadataForSync(
  existing: unknown,
  target: { ycSend: boolean; ycReceive: boolean },
): Record<string, unknown> {
  const meta = corridorMetadataRecord(existing)
  if (target.ycSend) meta.yc_send = true
  if (target.ycReceive) meta.yc_receive = true
  return mergeCorridorMetadataSurfaces(meta, existing)
}

/** Office has actively configured Grid payout, pay-in, or cross-border on this row. */
export function corridorHasConfiguredGridOps(metadata: unknown): boolean {
  const meta = corridorMetadataRecord(metadata)
  if (meta.grid_send_enabled === true || meta.grid_receive_enabled === true) return true
  if (
    meta.cross_border_enabled === true &&
    String(meta.cross_border_provider ?? "").trim().toLowerCase() === "grid"
  ) {
    return true
  }
  const surfaces = readCorridorSurfacesMap(meta)
  for (const overlay of [surfaces?.business, surfaces?.personal]) {
    if (overlay?.payout === "grid" || overlay?.pay_in === "grid") return true
    if (overlay?.cross_border?.enabled && overlay.cross_border.provider === "grid") return true
  }
  return false
}

export function gridCapabilityMetadataChanged(
  prior: Record<string, unknown>,
  next: Record<string, unknown>,
): boolean {
  return prior.grid_send !== true || prior.grid_receive !== true
}

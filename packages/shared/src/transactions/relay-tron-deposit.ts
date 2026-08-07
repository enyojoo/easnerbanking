export function isRelayTronDepositMetadata(meta?: Record<string, unknown> | null): boolean {
  const activity = String(meta?.activity_type ?? "").trim().toLowerCase()
  if (activity === "relay_tron_deposit") return true
  const sourceType = String(meta?.source_type ?? "").trim().toLowerCase()
  return sourceType === "relay_tron_deposit"
}

export function isRelayTronDepositInbound(input: {
  provider?: string | null
  metadata?: Record<string, unknown> | null
  source_type?: string | null
}): boolean {
  if (isRelayTronDepositMetadata(input.metadata)) return true
  const sourceType = String(input.source_type ?? "").trim().toLowerCase()
  if (sourceType === "relay_tron_deposit") return true
  const provider = String(input.provider ?? "").toLowerCase()
  return provider === "relay" && isRelayTronDepositMetadata(input.metadata)
}

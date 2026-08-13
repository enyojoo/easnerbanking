export type PostalAddressParts = {
  line1?: string | null
  city?: string | null
  state?: string | null
  postalCode?: string | null
  country?: string | null
}

/** Multi-line postal address for read-only display (registered address, verified identity, etc.). */
export function formatPostalAddressBlock(parts: PostalAddressParts): string {
  const line1 = String(parts.line1 ?? "").trim()
  const city = String(parts.city ?? "").trim()
  const state = String(parts.state ?? "").trim()
  const postal = String(parts.postalCode ?? "").trim()
  const country = String(parts.country ?? "").trim()

  const lines: string[] = []
  if (line1) lines.push(line1)

  const locality = [city, state].filter(Boolean).join(", ")
  const localityPostal = [locality, postal].filter(Boolean).join(" ")
  if (localityPostal) lines.push(localityPostal)
  if (country) lines.push(country)

  return lines.join("\n")
}

/** Single-line comma-separated postal address for compact read-only fields. */
export function formatPostalAddressLine(parts: PostalAddressParts): string {
  return formatPostalAddressBlock(parts).replace(/\n+/g, ", ")
}

export function hasPostalAddressParts(parts: PostalAddressParts): boolean {
  return Boolean(
    String(parts.line1 ?? "").trim() ||
      String(parts.city ?? "").trim() ||
      String(parts.state ?? "").trim() ||
      String(parts.postalCode ?? "").trim(),
  )
}

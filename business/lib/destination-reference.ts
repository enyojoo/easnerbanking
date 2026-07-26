export type DestinationReference =
  | `recipient:${string}`
  | `payroll_method:${string}`

export function destinationReference(
  source: "recipient" | "payroll_method",
  id: string,
): DestinationReference {
  const value = String(id || "").trim()
  if (!value) throw new Error("Destination identifier is required.")
  return `${source}:${value}` as DestinationReference
}

export function parseDestinationReference(value: string): {
  source: "recipient" | "payroll_method"
  id: string
} {
  const ref = String(value || "").trim()
  const separator = ref.indexOf(":")
  const source = ref.slice(0, separator)
  const id = ref.slice(separator + 1)
  if ((source !== "recipient" && source !== "payroll_method") || !id) {
    throw new Error("Invalid destination reference.")
  }
  return { source, id }
}

export function destinationMetadata(value: string): Record<string, string> {
  const parsed = parseDestinationReference(value)
  return parsed.source === "recipient"
    ? { recipient_id: parsed.id }
    : { payroll_method_id: parsed.id }
}

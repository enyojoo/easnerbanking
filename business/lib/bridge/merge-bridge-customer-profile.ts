const ADDRESS_KEYS = [
  "residential_address",
  "transliterated_residential_address",
  "registered_address",
  "transliterated_registered_address",
  "physical_address",
  "address",
] as const

const AUTHORITATIVE_KEYS = new Set([
  "id",
  "status",
  "kyc_status",
  "tos_status",
  "type",
  "endorsements",
  "capabilities",
  "has_accepted_terms_of_service",
  "created_at",
  "updated_at",
  "requirements_due",
  "future_requirements_due",
  "rejection_reasons",
  "persona_inquiry_type",
  "client_reference_id",
])

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null
}

function filledString(value: unknown): string | null {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  return trimmed || null
}

function usableIdNumber(value: unknown): boolean {
  const raw = filledString(value)
  if (!raw) return false
  return !/^[xX*•.]+$/.test(raw.replace(/[\s-]/g, ""))
}

function mergeAddress(primary: unknown, secondary: unknown): Record<string, unknown> | undefined {
  const left = asRecord(primary)
  const right = asRecord(secondary)
  if (!left && !right) return undefined
  const keys = new Set([...Object.keys(left ?? {}), ...Object.keys(right ?? {})])
  const out: Record<string, unknown> = {}
  for (const key of keys) {
    const fromPrimary = filledString(left?.[key])
    const fromSecondary = filledString(right?.[key])
    if (fromPrimary || fromSecondary) {
      out[key] = fromPrimary ?? fromSecondary
    } else if (left && key in left) {
      out[key] = left[key]
    } else if (right && key in right) {
      out[key] = right[key]
    }
  }
  return out
}

function idDocs(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) return []
  return value.filter((row): row is Record<string, unknown> => Boolean(asRecord(row)))
}

function mergeIdDocs(primary: unknown, secondary: unknown): Array<Record<string, unknown>> | undefined {
  const docs = [...idDocs(primary), ...idDocs(secondary)]
  if (!docs.length) return undefined
  const byType = new Map<string, Record<string, unknown>>()
  for (const doc of docs) {
    const type = String(doc.type ?? "").trim().toLowerCase() || "unknown"
    const prev = byType.get(type)
    if (!prev || (!usableIdNumber(prev.number) && usableIdNumber(doc.number))) {
      byType.set(type, doc)
    }
  }
  return [...byType.values()]
}

function personKey(person: Record<string, unknown>): string {
  const id = filledString(person.id)
  if (id) return `id:${id}`
  const email = filledString(person.email)?.toLowerCase()
  if (email) return `email:${email}`
  return ""
}

function mergePeople(primary: unknown, secondary: unknown): Array<Record<string, unknown>> | undefined {
  const people = [...idDocs(primary), ...idDocs(secondary)]
  if (!people.length) return undefined
  const order: string[] = []
  const byKey = new Map<string, Record<string, unknown>>()
  let loose = 0
  for (const person of people) {
    const key = personKey(person) || `loose:${loose++}`
    const prev = byKey.get(key)
    if (!prev) {
      order.push(key)
      byKey.set(key, person)
      continue
    }
    byKey.set(key, mergeBridgeCustomerRecords(prev, person))
  }
  return order.map((key) => byKey.get(key)!)
}

/**
 * Combine a Bridge customer GET with a webhook or KYC-link body.
 * Status stays with the primary record. Identity fields keep whichever side
 * actually includes them, so a state-and-country address does not erase a
 * street, date of birth, or ID that arrived on the other payload.
 */
export function mergeBridgeCustomerRecords(
  primary: Record<string, unknown>,
  secondary: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...secondary, ...primary }
  const keys = new Set([...Object.keys(primary), ...Object.keys(secondary)])
  for (const key of keys) {
    if (AUTHORITATIVE_KEYS.has(key)) {
      if (primary[key] != null && !(typeof primary[key] === "string" && !filledString(primary[key]))) {
        out[key] = primary[key]
      } else if (secondary[key] != null) {
        out[key] = secondary[key]
      }
      continue
    }
    if ((ADDRESS_KEYS as readonly string[]).includes(key)) {
      const address = mergeAddress(primary[key], secondary[key])
      if (address) out[key] = address
      continue
    }
    if (key === "identifying_information" || key === "identifyingInformation") {
      const docs = mergeIdDocs(primary[key], secondary[key])
      if (docs) out[key] = docs
      continue
    }
    if (key === "associated_persons" || key === "associatedPersons") {
      const people = mergePeople(primary[key], secondary[key])
      if (people) out[key] = people
      continue
    }
    const fromPrimary = filledString(primary[key])
    const fromSecondary = filledString(secondary[key])
    if (fromPrimary || fromSecondary) {
      out[key] = fromPrimary ?? fromSecondary
    }
  }
  return out
}

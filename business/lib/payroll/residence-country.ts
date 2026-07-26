import { countries } from "@/lib/countries"

export function normalizePayrollResidenceCountry(value: string | null | undefined): string {
  const normalized = String(value || "").trim()
  if (!normalized) return ""
  const match = countries.find(
    (country) =>
      country.code.toLowerCase() === normalized.toLowerCase() ||
      country.name.toLowerCase() === normalized.toLowerCase(),
  )
  return match?.code ?? normalized.toUpperCase()
}

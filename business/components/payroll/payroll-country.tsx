import { CountryFlag } from "@/components/flags"
import { countries } from "@/lib/countries"

export function PayrollCountry({ country }: { country: string | null }) {
  const value = String(country || "").trim()
  if (!value) return <span className="text-muted-foreground">–</span>

  const normalized = value.toLowerCase()
  const match = countries.find((item) =>
    item.code.toLowerCase() === normalized || item.name.toLowerCase() === normalized
  )
  if (!match) return <span>{value}</span>

  return (
    <span className="inline-flex items-center gap-2">
      <CountryFlag code={match.code} size={20} className="shrink-0" />
      <span>{match.name}</span>
    </span>
  )
}

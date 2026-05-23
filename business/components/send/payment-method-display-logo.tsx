import { Landmark, Link2 } from "lucide-react"
import { getTokenIconUrl } from "@easner/shared"

type Props = {
  name: string
  type?: string
  currency?: string
  displayLogoUrl?: string | null
  className?: string
}

/** Pay-in picker icon: uploaded display logo, else type/currency fallbacks. */
export function PaymentMethodDisplayLogo({
  name,
  type,
  currency,
  displayLogoUrl,
  className = "h-8 w-8 shrink-0 rounded object-contain border bg-muted/30",
}: Props) {
  const url = displayLogoUrl?.trim()
  if (url) {
    return <img src={url} alt={name} className={className} />
  }

  const cur = (currency ?? "").toUpperCase()
  const tokenUrl = getTokenIconUrl(cur)
  if (tokenUrl) {
    return <img src={tokenUrl} alt="" className={className} />
  }

  const t = (type ?? "").toLowerCase()
  if (t === "bank_account") {
    return (
      <span className="flex h-8 w-8 items-center justify-center shrink-0">
        <Landmark className="h-5 w-5" />
      </span>
    )
  }
  if (t === "provider") {
    return (
      <span className="flex h-8 w-8 items-center justify-center shrink-0">
        <Link2 className="h-5 w-5" />
      </span>
    )
  }

  return (
    <span className="flex h-8 w-8 items-center justify-center shrink-0 text-lg" aria-hidden>
      📱
    </span>
  )
}

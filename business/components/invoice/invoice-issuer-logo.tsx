/** Left-aligned business mark above invoice issuer name (pay-link size, left like address). */
export function InvoiceIssuerLogo({
  name,
  logoUrl,
}: {
  name: string
  logoUrl?: string | null
}) {
  const initial = name.trim().slice(0, 1).toUpperCase() || "?"
  if (logoUrl) {
    return (
      <img
        src={logoUrl}
        alt={name}
        className="mb-3 h-12 w-12 rounded-lg object-contain sm:h-14 sm:w-14"
      />
    )
  }
  return (
    <div
      aria-hidden
      className="mb-3 flex h-12 w-12 items-center justify-center rounded-lg bg-muted text-lg font-semibold text-muted-foreground sm:h-14 sm:w-14"
    >
      {initial}
    </div>
  )
}

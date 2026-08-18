import type { ReactNode } from "react"
import { BRAND } from "@/components/brand/brand-constants"

/**
 * Chrome for pay.easner.com. Payer-only: no dashboard nav, no sign-in, no operator
 * banners — the business's own name and logo lead, Easner signs the footer.
 */
export function CustomerPayShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-[100dvh] flex-col bg-background">
      <main className="flex flex-1 flex-col items-center px-4 py-6 sm:px-6 sm:py-10">
        <div className="flex w-full max-w-md flex-1 flex-col sm:max-w-lg">{children}</div>
      </main>

      <footer className="mt-auto border-t border-border/60 px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] text-center sm:px-6">
        <div className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
          <span>Powered by</span>
          <a
            href="https://www.easner.com/business"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center"
          >
            <img
              src={BRAND.logoBusinessLight}
              alt="Easner Business"
              className="h-5 w-auto object-contain dark:hidden sm:h-6"
            />
            <img
              src={BRAND.logoBusinessDark}
              alt="Easner Business"
              className="hidden h-5 w-auto object-contain dark:block sm:h-6"
            />
          </a>
        </div>
      </footer>
    </div>
  )
}

/** Business identity header shown above every payer surface. */
export function CustomerPayHeader({
  businessName,
  logoUrl,
  title,
  variant = "default",
}: {
  businessName: string
  logoUrl?: string | null
  title?: string | null
  /** Payment links: logo then “Pay {business}”. Other surfaces keep title + muted name. */
  variant?: "default" | "payBusiness"
}) {
  const payBusiness = variant === "payBusiness"
  const heading = payBusiness ? `Pay ${businessName}` : title?.trim() || "Payment"
  return (
    <div className="mb-6 flex flex-col items-center gap-3 text-center">
      {logoUrl ? (
        <img
          src={logoUrl}
          alt={businessName}
          className="h-12 w-12 rounded-lg object-contain sm:h-14 sm:w-14"
        />
      ) : (
        <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-muted text-lg font-semibold text-muted-foreground sm:h-14 sm:w-14">
          {businessName.slice(0, 1).toUpperCase()}
        </div>
      )}
      <div className="space-y-1">
        {payBusiness ? null : <p className="text-sm text-muted-foreground">{businessName}</p>}
        <h1 className="text-xl font-semibold text-foreground sm:text-2xl">{heading}</h1>
      </div>
    </div>
  )
}

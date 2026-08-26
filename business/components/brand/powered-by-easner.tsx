import { BRAND } from "@/components/brand/brand-constants"
import { cn } from "@/lib/utils"

/** Same “Powered by Easner Business” mark used on invoices, payment links, and Checkout. */
export function PoweredByEasner({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex items-center justify-center gap-1.5 text-xs text-muted-foreground",
        className,
      )}
    >
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
  )
}

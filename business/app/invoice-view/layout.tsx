import type { Metadata } from "next"

/** Per-invoice title uses the real business name in [id]/layout.tsx `generateMetadata`. */
export const metadata: Metadata = {
  description: "View your invoice",
}

export default function InvoiceViewLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen flex flex-col bg-background overflow-y-auto">
      <main className="flex-1 flex flex-col items-center justify-start w-full min-h-0 px-4 sm:px-6 py-6 sm:py-8 pb-12">
        {children}
      </main>
    </div>
  )
}

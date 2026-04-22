import type React from "react"
import type { Metadata, Viewport } from "next"
import { GeistSans } from "geist/font/sans"
import { GeistMono } from "geist/font/mono"
import { Toaster } from "@/components/ui/sonner"
import { ClientAuthProvider } from "@/components/client-auth-provider"
import { ChunkLoadErrorHandler } from "@/components/chunk-load-error-handler"
import { PostHogProvider } from "@/components/posthog-provider"
import { Providers } from "@/components/providers"
import { Suspense } from "react"
import { LoadingSpinner } from "@/components/loading-spinner"
import { PwaStandaloneRoot } from "@/components/pwa/pwa-standalone-root"
import { PwaInstallProvider } from "@/components/pwa/pwa-install-provider"
import { BusinessViewportGate } from "@/components/layout/business-viewport-gate"
import "./globals.css"
import { BRAND } from "@easner/shared"

export const metadata: Metadata = {
  title: "Easner Business Banking",
  description:
    "Stablecoin-powered banking infrastructure with multi-currency accounts, cards, invoicing, and payments collections.",
  generator: "Easner",
  icons: {
    icon: BRAND.favicon,
    apple: [{ url: BRAND.favicon }],
  },
  appleWebApp: {
    capable: true,
    title: "Easner Counter",
    statusBarStyle: "default",
  },
}

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F6F3EB" },
    { media: "(prefers-color-scheme: dark)", color: "#0F1110" },
  ],
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`font-sans ${GeistSans.variable} ${GeistMono.variable}`}
        suppressHydrationWarning
      >
        <ChunkLoadErrorHandler />
        <Suspense fallback={<LoadingSpinner />}>
          <PostHogProvider>
            <ClientAuthProvider>
              <PwaStandaloneRoot />
              <PwaInstallProvider>
                <Providers>
                  <BusinessViewportGate>{children}</BusinessViewportGate>
                </Providers>
              </PwaInstallProvider>
            </ClientAuthProvider>
          </PostHogProvider>
          <Toaster />
        </Suspense>
      </body>
    </html>
  )
}

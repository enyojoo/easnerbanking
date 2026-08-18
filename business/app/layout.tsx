import type React from "react"
import type { Metadata, Viewport } from "next"
import { GeistSans } from "geist/font/sans"
import { GeistMono } from "geist/font/mono"
import { Toaster } from "@/components/ui/sonner"
import { ClientAuthProvider } from "@/components/client-auth-provider"
import { ChunkLoadErrorHandler } from "@/components/chunk-load-error-handler"
import { PostHogProvider } from "@/components/posthog-provider"
import { SurfaceProviders } from "@/components/surface-providers"
import { WebVitalsReporter } from "@/components/web-vitals-reporter"
import { Suspense } from "react"
import { PwaStandaloneRoot } from "@/components/pwa/pwa-standalone-root"
import { PwaInstallProvider } from "@/components/pwa/pwa-install-provider"
import { BusinessViewportGate } from "@/components/layout/business-viewport-gate"
import { AppSurfaceLayout } from "@/components/app-surface-layout"
import { getBusinessAppPublicOrigin } from "@/lib/business-app-public-url"
import { pickPublicHostname } from "@/lib/customer-hosts"
import { headers } from "next/headers"
import "./globals.css"
import { BRAND } from "@easner/shared"

const ROOT_DESCRIPTION =
  "Stablecoin-powered business banking with multi-currency accounts, cards, invoicing, and global payouts – built for modern finance teams and operators."

export const metadata: Metadata = {
  metadataBase: new URL(getBusinessAppPublicOrigin()),
  title: {
    default: "Easner Business Banking",
  },
  description: ROOT_DESCRIPTION,
  applicationName: "Easner Business Banking",
  generator: "Easner",
  robots: {
    index: false,
    follow: false,
  },
  openGraph: {
    title: "Easner Business Banking",
    description: ROOT_DESCRIPTION,
    url: "/",
    siteName: "Easner Business Banking",
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    site: "@easnerbanking",
    creator: "@easnerbanking",
    title: "Easner Business Banking",
    description: ROOT_DESCRIPTION,
  },
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
  width: "device-width",
  initialScale: 1,
  // Business web is light-only; match browser chrome to ivory surface
  themeColor: "#F6F3EB",
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const headerList = await headers()
  const hostname = pickPublicHostname(headerList.get("x-forwarded-host"), headerList.get("host"))

  return (
    <html lang="en" className="light" suppressHydrationWarning>
      <body
        className={`font-sans ${GeistSans.variable} ${GeistMono.variable}`}
        suppressHydrationWarning
      >
        <ChunkLoadErrorHandler />
        <Suspense fallback={null}>
          <PostHogProvider>
            <ClientAuthProvider>
              <PwaStandaloneRoot />
              <PwaInstallProvider>
                <SurfaceProviders hostname={hostname}>
                  <BusinessViewportGate hostname={hostname}>
                    <AppSurfaceLayout>{children}</AppSurfaceLayout>
                  </BusinessViewportGate>
                </SurfaceProviders>
              </PwaInstallProvider>
              <WebVitalsReporter />
            </ClientAuthProvider>
          </PostHogProvider>
        </Suspense>
        <Toaster />
      </body>
    </html>
  )
}

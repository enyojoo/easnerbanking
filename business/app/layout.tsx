import type React from "react"
import type { Metadata, Viewport } from "next"
import { GeistSans } from "geist/font/sans"
import { GeistMono } from "geist/font/mono"
import { Toaster } from "sonner"
import { ClientAuthProvider } from "@/components/client-auth-provider"
import { ChunkLoadErrorHandler } from "@/components/chunk-load-error-handler"
import { PostHogProvider } from "@/components/posthog-provider"
import { Providers } from "@/components/providers"
import { Suspense } from "react"
import { PwaStandaloneRoot } from "@/components/pwa/pwa-standalone-root"
import { PwaInstallProvider } from "@/components/pwa/pwa-install-provider"
import "./globals.css"

const ICON =
  "https://seeqjiebmrnolcyydewj.supabase.co/storage/v1/object/public/brand/Easner%20Favicon.svg"

export const metadata: Metadata = {
  title: "Easner Business Banking",
  description: "Easner Business Banking - Modern banking built on Column infrastructure",
  generator: "v0.app",
  icons: {
    icon: ICON,
    apple: [{ url: ICON }],
  },
  appleWebApp: {
    capable: true,
    title: "Easner Counter",
    statusBarStyle: "default",
  },
}

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fafafa" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body className={`font-sans ${GeistSans.variable} ${GeistMono.variable}`}>
        <ChunkLoadErrorHandler />
        <Suspense fallback={null}>
          <PostHogProvider>
            <ClientAuthProvider>
              <PwaStandaloneRoot />
              <PwaInstallProvider>
                <Providers>{children}</Providers>
              </PwaInstallProvider>
            </ClientAuthProvider>
          </PostHogProvider>
          <Toaster />
        </Suspense>
      </body>
    </html>
  )
}

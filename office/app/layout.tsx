import type { Metadata } from "next"
import { GeistSans } from "geist/font/sans"
import { GeistMono } from "geist/font/mono"
import { AuthProvider } from "@/lib/auth-context"
import { OfficeQueryProvider } from "@/components/providers"
import { ProtectedRouteWrapper } from "@/components/auth/protected-route-wrapper"
import { ThemeProvider } from "@/components/theme-provider"
import { DesktopMinViewportGate } from "@/components/layout/desktop-min-viewport-gate"
import { OfficeShellGate } from "@/components/layout/office-shell-gate"
import { Toaster } from "@/components/ui/sonner"
import "./globals.css"

export const metadata: Metadata = {
  title: "Easner Office",
  description: "Easner Office",
  metadataBase: new URL("https://bk.easner.com"),
  icons: {
    icon: "https://seeqjiebmrnolcyydewj.supabase.co/storage/v1/object/public/brand/Easner%20Favicon.svg",
  },
  robots: {
    index: false,
    follow: false,
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={`font-sans ${GeistSans.variable} ${GeistMono.variable}`}>
        <AuthProvider>
          <OfficeQueryProvider>
            <ThemeProvider>
              <DesktopMinViewportGate product="office">
                <ProtectedRouteWrapper>
                  <OfficeShellGate>{children}</OfficeShellGate>
                </ProtectedRouteWrapper>
                <Toaster />
              </DesktopMinViewportGate>
            </ThemeProvider>
          </OfficeQueryProvider>
        </AuthProvider>
      </body>
    </html>
  )
}

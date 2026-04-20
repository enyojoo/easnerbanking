import type { Metadata } from "next"
import { GeistSans } from "geist/font/sans"
import { GeistMono } from "geist/font/mono"
import { Playfair_Display } from "next/font/google"
import { AuthProvider } from "@/lib/auth-context"
import { OfficeQueryProvider } from "@/components/providers"
import { ProtectedRouteWrapper } from "@/components/auth/protected-route-wrapper"
import { ThemeProvider } from "@/components/theme-provider"
import { DesktopMinViewportGate } from "@/components/layout/desktop-min-viewport-gate"
import "./globals.css"

const playfair = Playfair_Display({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-playfair",
  weight: ["400", "500", "600", "700"],
})

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
    <html lang="en" suppressHydrationWarning>
      <body className={`font-sans ${GeistSans.variable} ${GeistMono.variable} ${playfair.variable}`} suppressHydrationWarning>
        <AuthProvider>
          <OfficeQueryProvider>
            <ThemeProvider
              attribute="class"
              defaultTheme="light"
              enableSystem
              disableTransitionOnChange
              storageKey="easner-office-theme"
            >
              <DesktopMinViewportGate product="office">
                <ProtectedRouteWrapper>{children}</ProtectedRouteWrapper>
              </DesktopMinViewportGate>
            </ThemeProvider>
          </OfficeQueryProvider>
        </AuthProvider>
      </body>
    </html>
  )
}

import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Dashboard - Easner",
  description: "Admin dashboard for managing Easner platform operations, users, and transactions.",
  robots: {
    index: false,
    follow: false,
  },
}

export default function OfficeDashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <>{children}</>
}

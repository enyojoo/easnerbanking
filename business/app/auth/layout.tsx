import { AuthLayoutShell } from "@/components/auth/auth-layout-shell"

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <AuthLayoutShell>{children}</AuthLayoutShell>
}

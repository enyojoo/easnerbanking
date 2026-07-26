import { PayrollWorkspaceShell } from "@/components/payroll/payroll-workspace-shell"

export default function PayrollLayout({ children }: { children: React.ReactNode }) {
  return <PayrollWorkspaceShell>{children}</PayrollWorkspaceShell>
}

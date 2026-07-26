import { redirect } from "next/navigation"

export default async function EditPayrollRunPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  redirect(`/payroll/runs/new?edit=${encodeURIComponent(id)}`)
}

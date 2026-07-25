import { PayrollRunEditFlow } from "@/components/payroll/payroll-run-edit-flow"

export default async function EditPayrollRunPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  return <PayrollRunEditFlow runId={id} />
}

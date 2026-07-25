"use client"

import { useParams } from "next/navigation"
import { PayrollPersonEditFlow } from "@/components/payroll/payroll-person-edit-flow"

export default function EditPayrollPersonPage() {
  const { personId } = useParams<{ personId: string }>()
  return <PayrollPersonEditFlow personId={personId} />
}

import { NextResponse } from "next/server"
import { assertInternalCronAuthorized } from "@/lib/api/internal-auth"
import { processPayrollExecutionJobs } from "@/lib/payroll/execution-jobs"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { sanitizePayrollExecutionError } from "@/lib/payroll/execution-error"

export async function GET(request: Request) {
  try {
    assertInternalCronAuthorized(request)
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  try {
    return NextResponse.json(
      await processPayrollExecutionJobs(createSupabaseAdmin(), 1),
    )
  } catch (cause) {
    const message = sanitizePayrollExecutionError(cause)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

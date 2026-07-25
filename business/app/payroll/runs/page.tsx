"use client"

import Link from "next/link"
import { Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { PayrollNavTabs } from "@/components/payroll/payroll-nav-tabs"
import { PayrollRunStatusBadge } from "@/components/payroll/payroll-run-status-badge"
import { usePayrollRuns } from "@/hooks/queries/use-payroll"
import { useCreatePayrollRun } from "@/hooks/mutations/use-payroll"
import { formatCurrency, formatDate } from "@/lib/utils"
import { toast } from "sonner"
import { useRouter } from "next/navigation"

export default function PayrollRunsPage() {
  const runsQuery = usePayrollRuns()
  const createRun = useCreatePayrollRun()
  const router = useRouter()

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Runs</h1>
          <p className="mt-1 text-sm text-muted-foreground">Payroll batches and history.</p>
        </div>
        <Button
          variant="primary"
          onClick={() =>
            createRun.mutate(
              {},
              {
                onSuccess: (res) => router.push(`/payroll/runs/${res.run.id}`),
                onError: (e) => toast.error(e.message),
              },
            )
          }
          disabled={createRun.isPending}
        >
          <Plus className="h-4 w-4 mr-2" />
          New run
        </Button>
      </div>

      <PayrollNavTabs />

      <div className="space-y-3">
        {(runsQuery.data ?? []).length === 0 ? (
          <Card className="shadow-soft">
            <CardContent className="p-8 text-center text-sm text-muted-foreground">
              No runs yet.
            </CardContent>
          </Card>
        ) : (
          runsQuery.data?.map((run) => (
            <Link key={run.id} href={`/payroll/runs/${run.id}`}>
              <Card className="shadow-soft hover:shadow-card transition-shadow">
                <CardContent className="p-4 flex items-center justify-between gap-4">
                  <div>
                    <p className="font-medium tabular-nums">
                      {formatCurrency(run.totalSource, run.sourceCurrency)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {run.scheduledFor ? formatDate(run.scheduledFor) : formatDate(run.createdAt)}
                    </p>
                  </div>
                  <PayrollRunStatusBadge status={run.status} />
                </CardContent>
              </Card>
            </Link>
          ))
        )}
      </div>
    </div>
  )
}

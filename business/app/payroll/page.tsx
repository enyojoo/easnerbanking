"use client"

import Link from "next/link"
import { ArrowRight, Users } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { PayrollNavTabs } from "@/components/payroll/payroll-nav-tabs"
import { PayrollLegalNote } from "@/components/payroll/payroll-legal-note"
import { PayrollRunStatusBadge } from "@/components/payroll/payroll-run-status-badge"
import { usePayrollOverview } from "@/hooks/queries/use-payroll"
import { useCreatePayrollRun } from "@/hooks/mutations/use-payroll"
import { formatCurrency, formatDate } from "@/lib/utils"
import { railLabel } from "@/lib/payroll/helpers"
import { toast } from "sonner"
import { useRouter } from "next/navigation"

export default function PayrollOverviewPage() {
  const router = useRouter()
  const overviewQuery = usePayrollOverview()
  const createRun = useCreatePayrollRun()
  const overview = overviewQuery.data

  const primaryHref = overview?.pendingApprovalRunId
    ? `/payroll/runs/${overview.pendingApprovalRunId}`
    : overview?.draftRunId
      ? `/payroll/runs/${overview.draftRunId}`
      : null

  const primaryLabel = overview?.pendingApprovalRunId
    ? "Review draft"
    : overview?.draftRunId
      ? "Continue draft"
      : "Run payroll"

  async function handleRunPayroll() {
    if (primaryHref) {
      router.push(primaryHref)
      return
    }
    try {
      const res = await createRun.mutateAsync({})
      router.push(`/payroll/runs/${res.run.id}`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not start payroll run")
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Payroll</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Pay employees and contractors from one balance — any rail.
        </p>
      </div>

      <PayrollNavTabs />

      <Card className="shadow-card border-border/70 mb-6">
        <CardContent className="p-6 sm:p-8">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Next payday</p>
              <p className="mt-1 text-3xl font-semibold tabular-nums tracking-tight">
                {overview?.nextPayday ? formatDate(overview.nextPayday) : "Not scheduled"}
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                Estimated total{" "}
                <span className="font-medium text-foreground tabular-nums">
                  {formatCurrency(overview?.estimatedTotal ?? 0, overview?.sourceCurrency ?? "USD")}
                </span>
              </p>
            </div>
            <Button
              variant="primary"
              size="lg"
              className="min-w-[160px]"
              onClick={() => void handleRunPayroll()}
              disabled={createRun.isPending || (overview?.activeCount ?? 0) === 0}
            >
              {primaryLabel}
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>

          <div className="mt-6 flex flex-wrap gap-4 text-sm">
            <span>
              <Users className="inline h-4 w-4 mr-1 text-primary" />
              {overview?.activeCount ?? 0} active
            </span>
            <span className="tabular-nums">
              {overview?.funded ? (
                <span className="text-emerald-700 dark:text-emerald-400">Funded</span>
              ) : (
                <span className="text-amber-700 dark:text-amber-400">
                  Short {formatCurrency(overview?.shortfall ?? 0, overview?.sourceCurrency ?? "USD")}
                </span>
              )}
            </span>
            {overview?.railMix
              ? Object.entries(overview.railMix)
                  .filter(([, n]) => n > 0)
                  .map(([rail, n]) => (
                    <span key={rail}>
                      {n} {railLabel(rail as keyof typeof overview.railMix)}
                    </span>
                  ))
              : null}
          </div>
        </CardContent>
      </Card>

      {overview?.needsDestinationCount ? (
        <Card className="shadow-soft border-border/70 mb-6">
          <CardContent className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <p className="text-sm">
              {overview.needsDestinationCount} people need a destination (EASETAG or recipient).
            </p>
            <Button variant="outline" asChild>
              <Link href="/payroll/people">Fix in People</Link>
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground">Recent runs</h2>
        {(overview?.recentRuns ?? []).length === 0 ? (
          <Card className="shadow-soft">
            <CardContent className="p-6 text-sm text-muted-foreground">
              No payroll runs yet. Add people, then run payroll.
            </CardContent>
          </Card>
        ) : (
          overview?.recentRuns.map((run) => (
            <Link key={run.id} href={`/payroll/runs/${run.id}`}>
              <Card className="shadow-soft hover:shadow-card transition-shadow">
                <CardContent className="p-4 flex items-center justify-between gap-4">
                  <div>
                    <p className="font-medium tabular-nums">
                      {formatCurrency(run.totalSource, run.sourceCurrency)}
                    </p>
                    <p className="text-xs text-muted-foreground">{formatDate(run.createdAt)}</p>
                  </div>
                  <PayrollRunStatusBadge status={run.status} />
                </CardContent>
              </Card>
            </Link>
          ))
        )}
      </section>

      <PayrollLegalNote className="mt-8" />
    </div>
  )
}

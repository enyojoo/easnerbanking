"use client"

import Link from "next/link"
import {
  AlertCircle,
  ArrowRight,
  CalendarDays,
  CircleDollarSign,
  Upload,
  Users,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Skeleton } from "@/components/ui/skeleton"
import { PayrollLegalNote } from "@/components/payroll/payroll-legal-note"
import { PayrollPermissionAction } from "@/components/payroll/payroll-permission-action"
import { PayrollRunStatusBadge } from "@/components/payroll/payroll-run-status-badge"
import { PayrollInlineRefreshing } from "@/components/payroll/payroll-page-skeleton"
import { PayrollDetailLink } from "@/components/payroll/payroll-detail-link"
import { usePayrollCapabilities, usePayrollOverview } from "@/hooks/queries/use-payroll"
import { formatCurrency, formatDate } from "@/lib/utils"

export default function PayrollOverviewPage() {
  const overviewQuery = usePayrollOverview()
  const capabilitiesQuery = usePayrollCapabilities()
  const canPrepare = Boolean(capabilitiesQuery.data?.canPrepare)
  const overview = overviewQuery.data
  const empty = !overviewQuery.isPending && (overview?.headcount ?? 0) === 0

  return (
    <>
      {overviewQuery.isPending && !overviewQuery.data ? (
        <div className="grid gap-4 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-32 rounded-2xl" />)}
        </div>
      ) : overviewQuery.isError ? (
        <Card><CardContent className="p-8 text-center">
          <p className="font-medium">Payroll couldn’t be loaded</p>
          <p className="mt-1 text-sm text-muted-foreground">Your data is safe. Try loading it again.</p>
          <Button className="mt-4" variant="outline" onClick={() => void overviewQuery.refetch()}>Try again</Button>
        </CardContent></Card>
      ) : empty ? (
        <Card className="overflow-hidden border-primary/15 shadow-card">
          <CardContent className="grid gap-8 p-6 sm:p-10 lg:grid-cols-[1.1fr_.9fr]">
            <div>
              <div className="mb-4 inline-flex rounded-2xl bg-primary/10 p-3 text-primary"><Users className="h-6 w-6" /></div>
              <h2 className="text-xl font-semibold">Set up your payroll</h2>
              <p className="mt-2 max-w-lg text-sm text-muted-foreground">
                Add who you pay, confirm how they receive money, then create your first payroll run.
              </p>
              <div className="mt-6 flex flex-wrap gap-2">
                <PayrollPermissionAction allowed={canPrepare} loading={capabilitiesQuery.isPending}>
                  <Button variant="primary" asChild><Link href="/payroll/people/new">Add your first person</Link></Button>
                </PayrollPermissionAction>
                <PayrollPermissionAction allowed={canPrepare} loading={capabilitiesQuery.isPending}>
                  <Button variant="outline" asChild><Link href="/payroll/people/import"><Upload className="mr-2 h-4 w-4" />Import people</Link></Button>
                </PayrollPermissionAction>
              </div>
            </div>
            <ol className="space-y-4">
              {[
                ["1", "Add an employee or contractor", "Use a verified EASETAG or enter payment details manually."],
                ["2", "Confirm their receiving method", "See who is ready before you include them in a run."],
                ["3", "Create your first payroll run", "Review funding, approve, and track every payment."],
              ].map(([n, title, description]) => (
                <li key={n} className="flex gap-3">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">{n}</span>
                  <div><p className="text-sm font-medium">{title}</p><p className="text-xs text-muted-foreground">{description}</p></div>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard icon={CalendarDays} label="Next payday" value={overview?.nextPayday ? formatDate(overview.nextPayday) : "Not scheduled"} />
            <MetricCard icon={CircleDollarSign} label="Estimated payroll" value={formatCurrency(overview?.estimatedTotal ?? 0, overview?.sourceCurrency ?? "USD")} />
            <MetricCard icon={Users} label="People ready" value={`${Math.max(0, (overview?.activeCount ?? 0) - (overview?.attentionCount ?? 0))} of ${overview?.activeCount ?? 0}`} />
            <MetricCard
              icon={AlertCircle}
              label="Funding readiness"
              value={overview?.funded ? "Ready" : `${formatCurrency(overview?.shortfall ?? 0, overview?.sourceCurrency ?? "USD")} short`}
              tone={overview?.funded ? "positive" : "warning"}
            />
          </div>

          {(overview?.attentionItems ?? []).length > 0 ? (
            <section className="mt-8">
              <h2 className="mb-3 text-base font-semibold">Needs attention</h2>
              <div className="grid gap-3 lg:grid-cols-2">
                {overview?.attentionItems.map((item) => (
                  <Card key={`${item.code}-${item.actionHref}`} className="shadow-soft">
                    <CardContent className="flex items-start justify-between gap-4 p-4">
                      <div>
                        <p className="text-sm font-medium">{item.title}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{item.description}</p>
                      </div>
                      <Button variant="outline" size="sm" asChild><Link href={item.actionHref}>{item.actionLabel}</Link></Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </section>
          ) : null}

          <section className="mt-8">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-semibold">Recent runs</h2>
              <Button variant="ghost" size="sm" asChild><Link href="/payroll/runs">View all <ArrowRight className="ml-1 h-4 w-4" /></Link></Button>
            </div>
            <Card className="hidden overflow-hidden shadow-soft md:block">
              <Table>
                <TableHeader><TableRow><TableHead>Run</TableHead><TableHead>Payday</TableHead><TableHead>Total</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
                <TableBody>
                  {(overview?.recentRuns ?? []).map((run) => (
                    <TableRow key={run.id} className="cursor-pointer">
                      <TableCell><PayrollDetailLink kind="run" id={run.id} className="font-medium" href={`/payroll/runs/${run.id}`}>{String(run.metadata?.name || "Payroll run")}</PayrollDetailLink></TableCell>
                      <TableCell>{run.payday ? formatDate(run.payday) : "—"}</TableCell>
                      <TableCell className="tabular-nums">{formatCurrency(run.totalSource, run.sourceCurrency)}</TableCell>
                      <TableCell><PayrollRunStatusBadge status={run.status} /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
            <div className="space-y-3 md:hidden">
              {(overview?.recentRuns ?? []).map((run) => (
                <Card key={run.id} className="shadow-soft">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <PayrollDetailLink
                        kind="run"
                        id={run.id}
                        className="min-w-0 truncate font-medium"
                        href={`/payroll/runs/${run.id}`}
                      >
                        {String(run.metadata?.name || "Payroll run")}
                      </PayrollDetailLink>
                      <PayrollRunStatusBadge status={run.status} />
                    </div>
                    <div className="mt-4 flex items-end justify-between gap-3 border-t pt-3">
                      <div>
                        <p className="text-xs text-muted-foreground">Payday</p>
                        <p className="mt-1 text-sm">{run.payday ? formatDate(run.payday) : "—"}</p>
                      </div>
                      <p className="font-semibold tabular-nums">
                        {formatCurrency(run.totalSource, run.sourceCurrency)}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>
        </>
      )}
      <PayrollLegalNote className="mt-8" />
      <PayrollInlineRefreshing visible={overviewQuery.isFetching && !overviewQuery.isPending} />
    </>
  )
}

function MetricCard({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof Users
  label: string
  value: string
  tone?: "positive" | "warning"
}) {
  return (
    <Card className="shadow-soft">
      <CardContent className="p-5">
        <div className="mb-4 flex h-9 w-9 items-center justify-center rounded-xl bg-muted"><Icon className="h-4 w-4" /></div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={`mt-1 text-lg font-semibold ${tone === "positive" ? "text-emerald-700 dark:text-emerald-300" : tone === "warning" ? "text-amber-700 dark:text-amber-300" : ""}`}>{value}</p>
      </CardContent>
    </Card>
  )
}

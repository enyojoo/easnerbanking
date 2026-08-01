"use client"

import { useState } from "react"
import Link from "next/link"
import { useParams, useRouter, useSearchParams } from "next/navigation"
import { Download, Mail, MoreHorizontal, Pause, Pencil, Play, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { PayrollStatusBadge } from "@/components/payroll/payroll-status-badge"
import { PayrollReceivingMethod } from "@/components/payroll/payroll-receiving-method"
import { PayrollCountry } from "@/components/payroll/payroll-country"
import { PayrollDeleteDialog } from "@/components/payroll/payroll-delete-dialog"
import { PayrollDetailSkeleton, PayrollInlineRefreshing } from "@/components/payroll/payroll-page-skeleton"
import { PayrollDetailLink } from "@/components/payroll/payroll-detail-link"
import { PayrollSubpageShell } from "@/components/payroll/payroll-subpage-shell"
import { usePayrollCapabilities, usePayrollPerson, usePayrollSettings } from "@/hooks/queries/use-payroll"
import { useDeletePayrollPerson, useInvitePayrollPerson, useUpdatePayrollPerson } from "@/hooks/mutations/use-payroll"
import { formatCurrency, formatDate } from "@/lib/utils"
import { safePayrollReturnTo } from "@/lib/payroll/navigation"
import { PAYROLL_SUBPAGE_COPY } from "@/lib/copy/business-ui-copy"

type Payment = {
  id: string
  runId: string
  amount: number
  currency: string
  status: string
  settledAt: string | null
  settledAtDisplay?: string | null
  timezone?: string
  documents: Array<{ id: string; filename: string; status: string }>
}
export default function PayrollPersonDetailPage() {
  const params = useParams<{ personId: string }>()
  const router = useRouter()
  const searchParams = useSearchParams()
  const returnTo = safePayrollReturnTo(searchParams.get("returnTo"), "/payroll/people")
  const query = usePayrollPerson(params.personId)
  const capabilities = usePayrollCapabilities().data
  const settings = usePayrollSettings().data
  const businessCurrency = String(settings?.defaultCurrency || query.data?.person?.payCurrency || "USD").toUpperCase()
  const update = useUpdatePayrollPerson()
  const invite = useInvitePayrollPerson()
  const deletePerson = useDeletePayrollPerson()
  const [deleteOpen, setDeleteOpen] = useState(false)
  const detail = query.data as ({ person: NonNullable<typeof query.data>["person"]; paymentHistory?: Payment[]; connection?: { status: string; approvedAt?: string | null; preferredMethod?: { label: string } | null } | null }) | undefined
  const person = detail?.person
  if (query.isPending && !person) return <PayrollDetailSkeleton />
  if (!person) return <div className="mx-auto max-w-6xl px-4 pb-12"><p className="font-medium">This payroll person could not be found.</p><Button className="mt-4" variant="outline" asChild><Link href="/payroll/people">Back to People</Link></Button></div>
  const canPrepare = Boolean(capabilities?.canPrepare)
  const requestAction = person.rail === "easetag" && person.connectionStatus !== "approved" && person.email

  return <PayrollSubpageShell
    backHref={returnTo}
    backLabel="Back to People"
    section="People"
    current={person.fullName}
    title={person.fullName}
    description={PAYROLL_SUBPAGE_COPY.personDetail}
    leading={<Avatar className="h-14 w-14"><AvatarImage src={person.avatarUrl ?? undefined} /><AvatarFallback>{person.fullName.slice(0, 1)}</AvatarFallback></Avatar>}
    status={<PayrollStatusBadge status={person.status !== "active" ? person.status : person.readinessStatus} />}
    actions={canPrepare ? <>
        <Button variant="outline" asChild><Link href={`/payroll/people/${person.id}/edit`}><Pencil className="mr-2 h-4 w-4" />Edit</Link></Button>
        {requestAction ? <Button variant="primary" onClick={() => invite.mutate(person.id, { onSuccess: () => toast.success("Payroll request sent"), onError: (e) => toast.error(e.message) })}><Mail className="mr-2 h-4 w-4" />{person.connectionStatus === "pending" ? "Resend request" : "Send request"}</Button> : null}
        <DropdownMenu>
          <DropdownMenuTrigger asChild><Button variant="outline" size="icon" aria-label={`More actions for ${person.fullName}`}><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => update.mutate({ id: person.id, patch: { status: person.status === "active" ? "held" : "active" } }, { onSuccess: () => toast.success(person.status === "active" ? "Person put on hold" : "Person reactivated") })}>{person.status === "active" ? <Pause /> : <Play />}{person.status === "active" ? "Put on hold" : "Reactivate"}</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onClick={() => setDeleteOpen(true)}><Trash2 />Delete person</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </> : undefined}
  >

    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="space-y-6">
        <Card className="shadow-soft"><CardContent className="p-6"><h2 className="font-semibold">Payroll details</h2><dl className="mt-5 grid gap-5 sm:grid-cols-2">
          <Detail label="Classification" value={person.type} capitalize />
          <Detail label="Amount" value={formatCurrency(person.defaultAmount, businessCurrency)} />
          <div><dt className="text-xs text-muted-foreground">Residence country</dt><dd className="mt-1 text-sm"><PayrollCountry country={person.country} /></dd></div>
          <Detail label="Internal reference" value={person.internalReference || "—"} />
          {person.easetag ? (
            <Detail label="Easetag" value={`@${person.easetag.replace(/^@/, "")}`} />
          ) : null}
          <Detail label="Email" value={person.email || "—"} />
          <div><dt className="text-xs text-muted-foreground">Receiving method</dt><dd className="mt-1"><PayrollReceivingMethod person={person} typeOnly /></dd></div>
        </dl></CardContent></Card>

        <Card className="shadow-soft"><CardContent className="p-6"><div className="flex items-center justify-between"><div><h2 className="font-semibold">Payment history</h2><p className="mt-1 text-sm text-muted-foreground">Payroll payments and available pay stubs.</p></div></div>
          <div className="mt-4 divide-y">
            {(detail?.paymentHistory ?? []).length ? (detail?.paymentHistory ?? []).map((payment) => <div key={payment.id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div><PayrollDetailLink kind="run" id={payment.runId} className="font-medium" href={`/payroll/runs/${payment.runId}`}>{formatCurrency(payment.amount, payment.currency)}</PayrollDetailLink><p className="text-xs text-muted-foreground">{payment.settledAtDisplay || (payment.settledAt ? formatDate(payment.settledAt) : "Not settled")} · <span className="capitalize">{payment.status}</span></p></div>
              {payment.documents?.[0] ? <Button variant="outline" size="sm" asChild><a href={`/api/business/payroll/documents/${payment.documents[0].id}`}><Download className="mr-2 h-4 w-4" />Pay stub</a></Button> : null}
            </div>) : <p className="py-8 text-center text-sm text-muted-foreground">No payroll payments yet.</p>}
          </div>
        </CardContent></Card>
      </div>

      <div className="space-y-6">
        <Card className="shadow-soft"><CardContent className="p-5"><h2 className="font-semibold">Identity verification</h2><div className="mt-4 flex items-center justify-between"><span className="text-sm text-muted-foreground">Status</span><PayrollStatusBadge status={person.connectionStatus} /></div><p className="mt-4 text-xs text-muted-foreground">{person.connectionStatus === "approved" ? "This person’s identity is verified through EASETAG, and they approved sharing the verified fields with your business." : "No verified identity information is shared until the person approves."}</p></CardContent></Card>
      </div>
    </div>
    <PayrollDeleteDialog
      open={deleteOpen}
      onOpenChange={setDeleteOpen}
      title={`Delete ${person.fullName}?`}
      description="This permanently removes the person if they have never been included in a payroll run. People with payroll history must be put on hold instead."
      label="Delete person"
      pending={deletePerson.isPending}
      onDelete={async () => {
        try {
          await deletePerson.mutateAsync(person.id)
          toast.success("Person deleted")
          router.push("/payroll/people")
        } catch (error) {
          toast.error(error instanceof Error ? error.message : "Person could not be deleted")
          throw error
        }
      }}
    />
    <PayrollInlineRefreshing visible={query.isFetching && !query.isPending} />
  </PayrollSubpageShell>
}

function Detail({ label, value, capitalize }: { label: string; value: string; capitalize?: boolean }) {
  return <div><dt className="text-xs text-muted-foreground">{label}</dt><dd className={`mt-1 text-sm ${capitalize ? "capitalize" : ""}`}>{value}</dd></div>
}

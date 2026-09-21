"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { Users } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ConsolePageHeader } from "@/components/console/console-page-header"
import { CopyId } from "@/components/console/copy-id"
import { PAGE_COPY } from "@/lib/copy/business-ui-copy"
import { useConsoleLivemode } from "@/lib/console/livemode-context"
import { fetchWithSession } from "@/lib/fetch-with-session"

type Customer = {
  id: string
  email: string | null
  name: string | null
  external_id: string | null
  easetag: string | null
  status: string
  verification_status: string
  created: string
}

function verificationVariant(status: string) {
  if (status === "approved") return "emerald" as const
  if (status === "pending") return "amber" as const
  return "slate" as const
}

export default function PlatformCustomersPage() {
  const { livemode } = useConsoleLivemode()
  const queryClient = useQueryClient()
  const searchParams = useSearchParams()
  const [q, setQ] = useState("")

  useEffect(() => {
    const fromUrl = searchParams.get("q")
    if (fromUrl) setQ(fromUrl)
  }, [searchParams])
  const query = useQuery({
    queryKey: ["platform-customers", livemode, q],
    queryFn: async () => {
      const search = new URLSearchParams({ livemode })
      if (q.trim()) search.set("q", q.trim())
      const res = await fetchWithSession(`/api/platform/customers?${search}`)
      const body = (await res.json().catch(() => ({}))) as { customers?: Customer[]; error?: string }
      if (!res.ok) throw new Error(body.error || "Could not load customers")
      return body.customers ?? []
    },
  })

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <ConsolePageHeader
          title={PAGE_COPY.consoleCustomers.title}
          description={PAGE_COPY.consoleCustomers.intro}
        />
        {livemode === "test" ? (
          <CreateCustomerDialog onCreated={() => void queryClient.invalidateQueries({ queryKey: ["platform-customers"] })} />
        ) : null}
      </div>
      <Input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search name, email, cus_, easetag…"
        className="max-w-sm"
      />
      <Card>
        <CardContent className="p-0">
          {(query.data ?? []).length === 0 ? (
            <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
              <Users className="h-4 w-4" />
              {PAGE_COPY.consoleCustomers.empty}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px]">
                <thead className="border-b">
                  <tr>
                    <th className="p-4 text-left text-xs font-medium text-muted-foreground">Name</th>
                    <th className="p-4 text-left text-xs font-medium text-muted-foreground">Email</th>
                    <th className="p-4 text-left text-xs font-medium text-muted-foreground">ID</th>
                    <th className="p-4 text-left text-xs font-medium text-muted-foreground">External</th>
                    <th className="p-4 text-left text-xs font-medium text-muted-foreground">Verification</th>
                    <th className="p-4 text-left text-xs font-medium text-muted-foreground">Easetag</th>
                  </tr>
                </thead>
                <tbody>
                  {(query.data ?? []).map((customer) => (
                    <tr key={customer.id} className="border-b last:border-0 hover:bg-muted/40">
                      <td className="p-4">
                        <Link href={`/customers/${customer.id}`} className="text-sm font-medium hover:underline">
                          {customer.name || customer.email || customer.id}
                        </Link>
                        <p className="text-xs text-muted-foreground">
                          {new Date(customer.created).toLocaleString()}
                        </p>
                      </td>
                      <td className="p-4 text-sm text-muted-foreground">{customer.email || "—"}</td>
                      <td className="p-4">
                        <CopyId id={customer.id} />
                      </td>
                      <td className="p-4 font-mono text-xs text-muted-foreground">{customer.external_id || "—"}</td>
                      <td className="p-4">
                        <Badge variant={verificationVariant(customer.verification_status)}>
                          {customer.verification_status}
                        </Badge>
                      </td>
                      <td className="p-4 font-mono text-xs">{customer.easetag || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function CreateCustomerDialog({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState("")
  const [name, setName] = useState("")
  const [externalId, setExternalId] = useState("")
  const [easetag, setEasetag] = useState("")
  const [saving, setSaving] = useState(false)

  const create = async () => {
    setSaving(true)
    try {
      const res = await fetchWithSession("/api/platform/customers?livemode=test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim() || undefined,
          name: name.trim() || undefined,
          external_id: externalId.trim() || undefined,
          easetag: easetag.trim() || undefined,
        }),
      })
      const body = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) {
        toast.error(body.error || "Could not create customer")
        return
      }
      toast.success("Test customer created.")
      setOpen(false)
      setEmail("")
      setName("")
      setExternalId("")
      setEasetag("")
      onCreated()
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" size="sm">
          Create test customer
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create a test customer</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="cus-email">Email</Label>
            <Input id="cus-email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cus-name">Name</Label>
            <Input id="cus-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cus-ext">External id</Label>
            <Input id="cus-ext" value={externalId} onChange={(e) => setExternalId(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cus-tag">Easetag (optional)</Label>
            <Input id="cus-tag" value={easetag} onChange={(e) => setEasetag(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" disabled={saving} onClick={() => void create()}>
            {saving ? "Creating…" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

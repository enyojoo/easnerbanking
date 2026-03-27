"use client"

import { OfficeDashboardLayout } from "@/components/layout/office-dashboard-layout"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

const rows = [
  { area: "Customer / user ops", status: "Partial — users & compliance; notes/history when audit matures" },
  { area: "Payments / money movement", status: "Partial — transactions; exports/search TBD" },
  { area: "Compliance & identity", status: "In progress — KYC & Compliance tabs, Noah ops page" },
  { area: "B2B / commercial", status: "In progress — organizations, customers, invoices (Supabase)" },
  { area: "Treasury / product config", status: "Partial — rates & settings under Platform" },
  { area: "Integrations", status: "Partial — health page; webhook drill-down from Compliance" },
  { area: "Governance", status: "Started — audit log; admin_users.role column" },
  { area: "Reporting", status: "TBD — CSV exports" },
]

export default function IndustryChecklistPage() {
  return (
    <OfficeDashboardLayout>
      <div className="p-6 space-y-6 max-w-3xl">
        <div>
          <h1 className="text-2xl font-bold">Industry checklist</h1>
          <p className="text-gray-600 text-sm mt-1">
            Benchmark against typical fintech back-office expectations. Revisit as you ship.
          </p>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Areas</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3 text-sm">
              {rows.map((r) => (
                <li key={r.area} className="border-b border-border pb-3 last:border-0">
                  <p className="font-medium">{r.area}</p>
                  <p className="text-muted-foreground">{r.status}</p>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </OfficeDashboardLayout>
  )
}

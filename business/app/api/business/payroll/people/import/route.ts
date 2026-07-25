import { NextResponse } from "next/server"
import { requirePayrollAccess } from "@/lib/payroll/require-payroll-access"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { mapRowToPayrollPerson, payrollPersonToDbPayload } from "@/lib/payroll/map-payroll"
import type { PayrollPersonRow } from "@/lib/payroll/map-payroll"
import type { PayrollRail } from "@/lib/payroll/types"
import { resolvePayrollSourceDefaults } from "@/lib/payroll/source-account"

type CsvRow = {
  fullName: string
  email?: string
  type: "employee" | "contractor"
  amount: number
  rail: PayrollRail
  country?: string
  easetag?: string
  recipientId?: string
  errors: string[]
}

function parseCsv(text: string): CsvRow[] {
  const lines = text.trim().split(/\r?\n/).filter(Boolean)
  if (lines.length < 2) return []

  const header = lines[0].split(",").map((h) => h.trim().toLowerCase())
  const idx = (name: string) => header.indexOf(name)

  const rows: CsvRow[] = []
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",").map((c) => c.trim())
    const errors: string[] = []
    const fullName = cols[idx("name")] || cols[idx("full_name")] || cols[idx("fullname")] || ""
    if (!fullName) errors.push("Missing name")

    const typeRaw = (cols[idx("type")] || "employee").toLowerCase()
    const type = typeRaw === "contractor" ? "contractor" : "employee"

    const amount = Number(cols[idx("payroll_amount")] || cols[idx("amount")] || cols[idx("default_amount")] || 0)
    if (!Number.isFinite(amount) || amount <= 0) errors.push("Invalid amount")

    const receivingMethod = (cols[idx("receiving_method")] || cols[idx("rail")] || "bank account").toLowerCase()
    const rail: PayrollRail =
      receivingMethod.includes("easetag") ? "easetag"
        : receivingMethod.includes("mobile") ? "mobile"
          : receivingMethod.includes("stablecoin") || receivingMethod.includes("wallet") || receivingMethod === "crypto" ? "crypto"
            : "bank"

    rows.push({
      fullName,
      email: cols[idx("email")] || undefined,
      type,
      amount,
      rail,
      country: cols[idx("country")] || undefined,
      easetag: cols[idx("easetag")] || undefined,
      recipientId: cols[idx("recipient_id")] || undefined,
      errors,
    })
  }
  return rows
}

export async function POST(request: Request) {
  const ctx = await requirePayrollAccess(request, ["preparer", "approver"])
  if (!ctx.ok) return ctx.response

  const form = await request.formData().catch(() => null)
  const file = form?.get("file")
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "CSV file required" }, { status: 400 })
  }

  const text = await file.text()
  const parsed = parseCsv(text)
  if (parsed.length === 0) {
    return NextResponse.json({ error: "No rows found in CSV" }, { status: 400 })
  }

  const admin = createSupabaseAdmin()
  let payrollDefaults
  try {
    payrollDefaults = await resolvePayrollSourceDefaults(admin, ctx.businessId)
  } catch (cause) {
    return NextResponse.json(
      { error: cause instanceof Error ? cause.message : "Could not load Payroll account settings." },
      { status: 500 },
    )
  }
  const created: ReturnType<typeof mapRowToPayrollPerson>[] = []
  const invalid: CsvRow[] = []

  for (const row of parsed) {
    if (row.errors.length > 0) {
      invalid.push(row)
      continue
    }

    const payload = payrollPersonToDbPayload({
      businessId: ctx.businessId,
      person: {
        type: row.type,
        fullName: row.fullName,
        email: row.email ?? null,
        country: row.country ?? null,
        defaultAmount: row.amount,
        payCurrency: payrollDefaults.currency,
        payBasis: "fixed",
        hourlyRate: null,
        recipientId: row.recipientId ?? null,
        easetag: row.easetag ?? null,
        rail: row.rail,
        status: "active",
      },
    })

    const { data, error } = await admin.from("payroll_people").insert(payload).select("*").single()
    if (error) {
      invalid.push({ ...row, errors: [error.message] })
      continue
    }
    created.push(mapRowToPayrollPerson(data as PayrollPersonRow))
  }

  return NextResponse.json({
    created,
    invalid: invalid.map((row, index) => ({ row: index + 2, name: row.fullName, errors: row.errors })),
    imported: created.length,
  })
}

export async function GET() {
  const template = [
    "name,email,type,payroll_amount,receiving_method,country,easetag",
    "Jane Doe,jane@example.com,employee,2500,EASETAG,,janedoe",
    "John Contractor,john@example.com,contractor,1800,Bank account,US,",
  ].join("\n")

  return new NextResponse(template, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": 'attachment; filename="payroll-people-template.csv"',
    },
  })
}

import { NextResponse } from "next/server"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { requireOfficeAdmin } from "@/lib/api/admin-auth"
import { ACCOUNT_STATEMENTS_BUCKET } from "@/lib/statements/persist"

export async function GET(
  request: Request,
  context: { params: Promise<{ statementId: string }> },
) {
  const auth = await requireOfficeAdmin(request)
  if (!auth.ok) return auth.response

  const { statementId } = await context.params
  const id = String(statementId ?? "").trim()
  if (!id) return NextResponse.json({ error: "statementId required" }, { status: 400 })

  const admin = createSupabaseAdmin()
  const { data, error } = await admin
    .from("account_statements")
    .select("statement_id,storage_path,currency,period_from,period_to")
    .eq("statement_id", id)
    .maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: "Statement not found" }, { status: 404 })

  const downloaded = await admin.storage.from(ACCOUNT_STATEMENTS_BUCKET).download(data.storage_path)
  if (downloaded.error || !downloaded.data) {
    return NextResponse.json(
      { error: downloaded.error?.message || "Could not read stored statement" },
      { status: 404 },
    )
  }

  const bytes = new Uint8Array(await downloaded.data.arrayBuffer())
  const filename = `easner-statement-${data.currency}-${data.period_from}-${data.period_to}.pdf`
  return new NextResponse(bytes, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  })
}

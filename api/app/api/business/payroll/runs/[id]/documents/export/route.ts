import { NextResponse } from "next/server"
import { strToU8, zipSync } from "fflate"
import { requirePayrollAccess } from "@/lib/payroll/require-payroll-access"
import { createSupabaseAdmin } from "@/lib/supabase/admin"

export const runtime = "nodejs"

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await requirePayrollAccess(request, ["viewer", "preparer", "approver"])
  if (!ctx.ok) return ctx.response
  const { id } = await params
  const admin = createSupabaseAdmin()
  const { data: run } = await admin.from("payroll_runs")
    .select("id").eq("id", id).eq("business_id", ctx.businessId).maybeSingle()
  if (!run) return NextResponse.json({ error: "Payroll run not found." }, { status: 404 })

  const { data: documents, error } = await admin.from("payroll_documents")
    .select("id,line_id,filename,storage_path,content_hash,generated_at")
    .eq("business_id", ctx.businessId)
    .eq("run_id", id)
    .eq("type", "pay_stub")
    .eq("status", "ready")
    .order("created_at")
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!documents?.length) {
    return NextResponse.json({ error: "No pay stubs are available for this run." }, { status: 404 })
  }

  const entries: Record<string, Uint8Array> = {}
  const manifest: Array<Record<string, unknown>> = []
  for (const document of documents) {
    const downloaded = await admin.storage.from("payroll-documents")
      .download(String(document.storage_path))
    if (downloaded.error || !downloaded.data) {
      return NextResponse.json({ error: "A pay stub could not be exported." }, { status: 500 })
    }
    const entryName = `${document.line_id}/${document.filename}`
    entries[entryName] = new Uint8Array(await downloaded.data.arrayBuffer())
    manifest.push({
      documentId: document.id,
      lineId: document.line_id,
      filename: document.filename,
      zipEntry: entryName,
      contentHash: document.content_hash,
      generatedAt: document.generated_at,
    })
  }
  entries["manifest.json"] = strToU8(JSON.stringify({ runId: id, documents: manifest }, null, 2))
  const archive = zipSync(entries, { level: 6 })
  const archiveBody = archive.buffer.slice(
    archive.byteOffset,
    archive.byteOffset + archive.byteLength,
  ) as ArrayBuffer
  await admin.from("payroll_run_events").insert({
    business_id: ctx.businessId,
    run_id: id,
    actor_user_id: ctx.userId,
    event_type: "documents.bulk_downloaded",
    data: { documentCount: documents.length },
  })
  return new NextResponse(archiveBody, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="payroll-${id}-pay-stubs.zip"`,
      "Cache-Control": "private, no-store",
    },
  })
}

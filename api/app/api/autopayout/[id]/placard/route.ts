import { NextResponse } from "next/server"
import { createSupabaseAdmin, getUserFromApiRequest } from "@/lib/supabase/admin"
import { requireEasnerBusinessId } from "@/lib/terminal/context"
import { PLACARD_TEMPLATE_VERSION } from "@/lib/autopayout/constants"
import { computePlacardContentHash } from "@/lib/autopayout/placard-content-hash"
import { buildAutopayoutQrPayload } from "@/lib/autopayout/placard-qr-payload"
import { generateAndUploadAutopayoutPlacard } from "@/lib/autopayout/upload-placard-assets"
import { AUTOPAYOUT_PLACARD_BUCKET } from "@/lib/autopayout/placard-storage-paths"

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const user = await getUserFromApiRequest(request)
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const ctx = await requireEasnerBusinessId(user.id)
  if (!ctx.ok) return ctx.response

  const { id } = await context.params
  const autopayoutId = String(id || "").trim()
  if (!autopayoutId) {
    return NextResponse.json({ error: "Invalid id." }, { status: 400 })
  }

  const admin = createSupabaseAdmin()
  const { data: row, error } = await admin
    .from("autopayout_configs")
    .select(
      "id, business_id, label, crypto_currency, network, deposit_address, deposit_memo, status, archived_at, placard_hd_png_storage_path, placard_pdf_storage_path, placard_generated_at, placard_template_version, placard_content_hash",
    )
    .eq("id", autopayoutId)
    .eq("business_id", ctx.businessId)
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }
  if (!row) {
    return NextResponse.json({ error: "Not found." }, { status: 404 })
  }
  if (row.archived_at) {
    return NextResponse.json({ error: "Archived autopayout cannot generate placards." }, { status: 400 })
  }
  if (row.status !== "awaiting_deposit" || !String(row.deposit_address || "").trim()) {
    return NextResponse.json(
      { error: "Placard requires an active deposit address (awaiting_deposit)." },
      { status: 400 },
    )
  }

  const deposit = String(row.deposit_address || "").trim()
  const qrPayload = buildAutopayoutQrPayload(deposit, row.deposit_memo as string | null)
  const hash = computePlacardContentHash({
    label: row.label as string | null,
    cryptoCurrency: String(row.crypto_currency),
    network: String(row.network),
    depositAddress: deposit,
    depositMemo: row.deposit_memo as string | null,
    qrPayload,
  })

  if (
    row.placard_content_hash === hash &&
    Number(row.placard_template_version) === PLACARD_TEMPLATE_VERSION &&
    row.placard_hd_png_storage_path &&
    row.placard_pdf_storage_path
  ) {
    return NextResponse.json({
      ok: true,
      cached: true,
      placard_generated_at: row.placard_generated_at,
      placard_content_hash: hash,
    })
  }

  try {
    const result = await generateAndUploadAutopayoutPlacard({
      admin,
      businessId: ctx.businessId,
      autopayoutId,
      row: {
        label: row.label as string | null,
        crypto_currency: String(row.crypto_currency),
        network: String(row.network),
        deposit_address: deposit,
        deposit_memo: row.deposit_memo as string | null,
      },
    })
    return NextResponse.json({
      ok: true,
      cached: result.cached,
      placard_generated_at: result.generatedAt,
      placard_content_hash: result.contentHash,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 502 })
  }
}

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const user = await getUserFromApiRequest(request)
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const ctx = await requireEasnerBusinessId(user.id)
  if (!ctx.ok) return ctx.response

  const { id } = await context.params
  const autopayoutId = String(id || "").trim()
  if (!autopayoutId) {
    return NextResponse.json({ error: "Invalid id." }, { status: 400 })
  }

  const format = new URL(request.url).searchParams.get("format")?.toLowerCase()
  if (format !== "png" && format !== "pdf") {
    return NextResponse.json({ error: "Query format=png|pdf is required." }, { status: 400 })
  }

  const admin = createSupabaseAdmin()
  const { data: row, error } = await admin
    .from("autopayout_configs")
    .select("placard_hd_png_storage_path, placard_pdf_storage_path, archived_at")
    .eq("id", autopayoutId)
    .eq("business_id", ctx.businessId)
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }
  if (!row || row.archived_at) {
    return NextResponse.json({ error: "Not found." }, { status: 404 })
  }

  const path =
    format === "png" ? row.placard_hd_png_storage_path : row.placard_pdf_storage_path
  if (!path || !String(path).trim()) {
    return NextResponse.json({ error: "Placard not generated yet." }, { status: 404 })
  }

  const { data: signed, error: sErr } = await admin.storage
    .from(AUTOPAYOUT_PLACARD_BUCKET)
    .createSignedUrl(String(path).trim(), 600)

  if (sErr || !signed?.signedUrl) {
    return NextResponse.json({ error: sErr?.message || "Could not sign download URL." }, { status: 400 })
  }

  return NextResponse.json({
    url: signed.signedUrl,
    expires_in: 600,
    format,
  })
}

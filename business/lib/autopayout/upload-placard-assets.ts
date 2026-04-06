import type { SupabaseClient } from "@supabase/supabase-js"
import { PDF_LOGO_DATA_URL } from "@/lib/pdf-logo-base64"
import { PLACARD_TEMPLATE_VERSION, AUTOPAYOUT_PLACARD_BUCKET } from "./constants"
import { computePlacardContentHash } from "./placard-content-hash"
import { buildAutopayoutQrPayload } from "./placard-qr-payload"
import { autopayoutPlacardObjectPaths } from "./placard-storage-paths"
import { assetTickerFromCrypto, labelForTerminalNetwork } from "./network-label"
import { renderAutopayPlacardHdPng } from "./render-placard-hd-png"
import { renderAutopayPlacardPdfBuffer } from "./render-placard-pdf"

export type AutopayoutPlacardSourceRow = {
  label: string | null
  crypto_currency: string
  network: string
  deposit_address: string | null
  deposit_memo: string | null
}

export async function generateAndUploadAutopayoutPlacard(input: {
  admin: SupabaseClient
  businessId: string
  autopayoutId: string
  row: AutopayoutPlacardSourceRow
}): Promise<{
  contentHash: string
  pngPath: string
  pdfPath: string
  generatedAt: string
  cached: boolean
}> {
  const { admin, businessId, autopayoutId, row } = input
  const deposit = String(row.deposit_address || "").trim()
  if (!deposit) {
    throw new Error("Missing deposit address for placard.")
  }

  const qrPayload = buildAutopayoutQrPayload(deposit, row.deposit_memo)
  const placardInput = {
    label: row.label,
    assetTicker: assetTickerFromCrypto(row.crypto_currency),
    networkDisplay: labelForTerminalNetwork(row.crypto_currency, row.network),
    depositAddress: deposit,
    depositMemo: row.deposit_memo,
    qrPayload,
    logoImageHref: PDF_LOGO_DATA_URL,
  }

  const contentHash = computePlacardContentHash({
    label: row.label,
    cryptoCurrency: row.crypto_currency,
    network: row.network,
    depositAddress: deposit,
    depositMemo: row.deposit_memo,
    qrPayload,
  })

  const paths = autopayoutPlacardObjectPaths(businessId, autopayoutId)
  const bucket = admin.storage.from(AUTOPAYOUT_PLACARD_BUCKET)

  const [pngBuf, pdfBuf] = await Promise.all([
    renderAutopayPlacardHdPng(placardInput),
    renderAutopayPlacardPdfBuffer(placardInput),
  ])

  const upPng = await bucket.upload(paths.png, pngBuf, {
    contentType: "image/png",
    upsert: true,
  })
  if (upPng.error) throw upPng.error

  const upPdf = await bucket.upload(paths.pdf, pdfBuf, {
    contentType: "application/pdf",
    upsert: true,
  })
  if (upPdf.error) throw upPdf.error

  const generatedAt = new Date().toISOString()

  const { error: upRow } = await admin
    .from("autopayout_configs")
    .update({
      placard_hd_png_storage_path: paths.png,
      placard_pdf_storage_path: paths.pdf,
      placard_generated_at: generatedAt,
      placard_template_version: PLACARD_TEMPLATE_VERSION,
      placard_content_hash: contentHash,
      updated_at: generatedAt,
    })
    .eq("id", autopayoutId)
    .eq("business_id", businessId)

  if (upRow) throw upRow

  return {
    contentHash,
    pngPath: paths.png,
    pdfPath: paths.pdf,
    generatedAt,
    cached: false,
  }
}

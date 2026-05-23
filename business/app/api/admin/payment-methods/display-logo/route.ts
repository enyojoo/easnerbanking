import { NextResponse } from "next/server"
import { requireOfficeAdmin } from "@/lib/api/admin-auth"
import { deletePaymentMethodDisplayLogoByUrl } from "@/lib/manual-send/payment-method-logo-storage"

export const runtime = "nodejs"

export async function DELETE(request: Request) {
  const auth = await requireOfficeAdmin(request)
  if (!auth.ok) return auth.response

  let body: { url?: string } | null = null
  try {
    body = (await request.json()) as { url?: string }
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 })
  }

  const url = typeof body?.url === "string" ? body.url.trim() : ""
  if (!url) {
    return NextResponse.json({ error: "url is required" }, { status: 400 })
  }

  const result = await deletePaymentMethodDisplayLogoByUrl(url)
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 })
  }

  return NextResponse.json({ ok: true })
}

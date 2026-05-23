import { NextResponse } from "next/server"
import { requireOfficeAdmin } from "@/lib/api/admin-auth"
import {
  storePaymentMethodDisplayLogo,
  validatePaymentMethodLogoFile,
} from "@/lib/manual-send/payment-method-logo-storage"

export const runtime = "nodejs"

export async function POST(request: Request) {
  const auth = await requireOfficeAdmin(request)
  if (!auth.ok) return auth.response

  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return NextResponse.json({ error: "Invalid form data." }, { status: 400 })
  }

  const raw = form.get("file")
  if (!raw || typeof raw === "string") {
    return NextResponse.json({ error: "Missing file." }, { status: 400 })
  }

  const file = raw as File
  const v = validatePaymentMethodLogoFile(file)
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 })

  const buf = Buffer.from(await file.arrayBuffer())
  const stored = await storePaymentMethodDisplayLogo(buf, file.type)
  if ("error" in stored) {
    return NextResponse.json({ error: stored.error }, { status: 400 })
  }

  return NextResponse.json({ url: stored.url, path: stored.path })
}

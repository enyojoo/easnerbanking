import { NextResponse } from "next/server"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { requireOfficeAdmin } from "@/lib/api/admin-auth"

/**
 * Signed URL for KYC document path in `kyc-documents` bucket.
 */
export async function GET(request: Request) {
  const auth = await requireOfficeAdmin(request)
  if (!auth.ok) return auth.response

  const path = new URL(request.url).searchParams.get("path")
  if (!path) {
    return NextResponse.json({ error: "path query required" }, { status: 400 })
  }

  const admin = createSupabaseAdmin()
  const { data, error } = await admin.storage.from("kyc-documents").createSignedUrl(path, 3600)
  if (error || !data?.signedUrl) {
    console.error("kyc documents signed url:", error)
    return NextResponse.json({ error: error?.message || "Failed to sign URL" }, { status: 500 })
  }

  return NextResponse.json({ url: data.signedUrl })
}

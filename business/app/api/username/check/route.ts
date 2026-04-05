import { NextResponse } from "next/server"
import { createSupabaseAdmin, getUserFromApiRequest } from "@/lib/supabase/admin"
import { validateEasetag, normalizeEasetag } from "@/lib/easetag-validation"
import { isEasetagGloballyAvailable } from "@/lib/easetag-global"

/**
 * Mobile + web: `GET /api/username/check?easetag=foo` (optional auth to exclude current user).
 */
export async function GET(request: Request) {
  const url = new URL(request.url)
  const raw = url.searchParams.get("easetag") || ""
  const validation = validateEasetag(raw)
  if (!validation.valid) {
    return NextResponse.json({
      available: false,
      valid: false,
      error: validation.error ?? "Invalid Easetag",
    })
  }

  const user = await getUserFromApiRequest(request)
  const admin = createSupabaseAdmin()
  try {
    const available = await isEasetagGloballyAvailable(admin, raw, {
      excludeUserId: user?.id,
    })
    return NextResponse.json({ available, valid: true })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ available: false, valid: true, error: msg }, { status: 500 })
  }
}

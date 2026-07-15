import { NextResponse } from "next/server"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { requireOfficeAdmin } from "@/lib/api/admin-auth"

export async function PATCH(_request: Request, _context: { params: Promise<{ id: string }> }) {
  const auth = await requireOfficeAdmin(_request)
  if (!auth.ok) return auth.response

  return NextResponse.json(
    {
      error:
        "Reporting FX currencies are fixed (USD, EUR, GBP, NGN). Edit rates via Sync on the Reporting FX tab.",
    },
    { status: 400 },
  )
}

export async function DELETE(_request: Request, _context: { params: Promise<{ id: string }> }) {
  const auth = await requireOfficeAdmin(_request)
  if (!auth.ok) return auth.response

  return NextResponse.json(
    {
      error: "Reporting FX base currencies cannot be deleted from Office.",
    },
    { status: 400 },
  )
}

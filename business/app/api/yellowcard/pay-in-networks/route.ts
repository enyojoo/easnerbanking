import { NextResponse } from "next/server"
import { requireAuth } from "@/app/api/noah/_helpers"
import { resolveYcPayInNetworks } from "@/lib/yellowcard/pay-in-networks"

export const runtime = "nodejs"

/** MoMo networks for YC pay-in (scoped to receive channel when available). */
export async function GET(request: Request) {
  const auth = await requireAuth(request)
  if ("error" in auth) return auth.error

  const url = new URL(request.url)
  const country = String(url.searchParams.get("country") ?? "").trim().toUpperCase()
  const currency = String(url.searchParams.get("currency") ?? "").trim().toUpperCase()
  if (!country || !currency) {
    return NextResponse.json({ error: "country and currency required" }, { status: 400 })
  }

  const networks = await resolveYcPayInNetworks({ country, currency })
  return NextResponse.json({ networks })
}

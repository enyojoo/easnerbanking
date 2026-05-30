import { NextResponse } from "next/server"
import { requireAuth } from "@/app/api/noah/_helpers"
import { inferWalletAddress } from "@/lib/wallet-send/infer-address"

export const runtime = "nodejs"

export async function POST(request: Request) {
  const auth = await requireAuth(request)
  if ("error" in auth) return auth.error

  const body = (await request.json().catch(() => null)) as { address?: string } | null
  const address = String(body?.address || "").trim()
  if (!address) {
    return NextResponse.json({ error: "address is required" }, { status: 400 })
  }

  const candidates = inferWalletAddress(address)
  const best = candidates[0] ?? null
  return NextResponse.json({ candidates, best })
}

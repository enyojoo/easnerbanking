import { NextResponse } from "next/server"
import { syncCryptoRatesSafe } from "@/lib/fx/crypto-rate-sync"

export const runtime = "nodejs"

export async function GET(request: Request) {
  const auth = request.headers.get("authorization") || ""
  const cronSecret = process.env.CRON_SECRET || ""
  if (cronSecret && auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const result = await syncCryptoRatesSafe()
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.reason }, { status: 500 })
  }
  return NextResponse.json({ ok: true, ...result.result })
}

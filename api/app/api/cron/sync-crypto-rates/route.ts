import { NextResponse } from "next/server"
import { assertInternalCronAuthorized } from "@/lib/api/internal-auth"
import { syncCryptoRatesSafe } from "@/lib/fx/crypto-rate-sync"

export const runtime = "nodejs"
export const maxDuration = 300

export async function GET(request: Request) {
  try {
    assertInternalCronAuthorized(request)
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unauthorized"
    return NextResponse.json({ ok: false, error: msg }, { status: 401 })
  }

  const result = await syncCryptoRatesSafe()
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.reason }, { status: 500 })
  }

  const { updated, skipped, skippedPairs } = result.result
  return NextResponse.json({
    ok: true,
    updated,
    skipped,
    skippedPairs: skippedPairs.slice(0, 20).map((row) => {
      const base = `${row.from_currency}→${row.to_currency}/${row.receive_network}`
      return row.reason ? `${base} (${row.reason})` : base
    }),
  })
}

export async function POST(request: Request) {
  return GET(request)
}

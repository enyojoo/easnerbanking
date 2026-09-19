import { NextResponse } from "next/server"
import { requireOfficeAdmin } from "@/lib/api/admin-auth"
import { syncCryptoRatesSafe } from "@/lib/fx/crypto-rate-sync"

export const runtime = "nodejs"
export const maxDuration = 300

function formatSkippedPair(row: {
  from_currency: string
  to_currency: string
  receive_network: string
  reason?: string
}): string {
  const base = `${row.from_currency}→${row.to_currency}/${row.receive_network}`
  return row.reason ? `${base} (${row.reason})` : base
}

export async function POST(request: Request) {
  const auth = await requireOfficeAdmin(request)
  if (!auth.ok) return auth.response

  const result = await syncCryptoRatesSafe()
  if (!result.ok) {
    return NextResponse.json({ error: result.reason }, { status: 500 })
  }

  const { updated, skipped, skippedPairs } = result.result
  return NextResponse.json({
    ok: true,
    updated,
    skipped,
    skippedPairs: skippedPairs.slice(0, 30).map(formatSkippedPair),
  })
}

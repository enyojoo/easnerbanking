import { NextResponse } from "next/server"
import { assertInternalCronAuthorized } from "@/lib/api/internal-auth"
import { processNextWalletProvisioningJob } from "@/lib/wallet/turnkey-provisioning"

export const runtime = "nodejs"

async function drainWalletProvisioningBatch(): Promise<
  NextResponse<{ ok: true; results: Awaited<ReturnType<typeof processNextWalletProvisioningJob>>[] }>
> {
  const results: Awaited<ReturnType<typeof processNextWalletProvisioningJob>>[] = []
  for (let i = 0; i < 20; i++) {
    const r = await processNextWalletProvisioningJob()
    results.push(r)
    if (!r.processed || r.detail === "no_jobs" || r.detail === "turnkey_not_configured_or_disabled") {
      break
    }
  }
  return NextResponse.json({ ok: true, results })
}

function unauthorizedResponse(e: unknown): NextResponse<{ error: string }> {
  const msg = e instanceof Error ? e.message : String(e)
  const status = msg === "Unauthorized" ? 401 : 500
  return NextResponse.json({ error: msg }, { status })
}

/** Drain a small batch of Turnkey wallet provisioning jobs (cron). */
export async function POST(request: Request) {
  try {
    assertInternalCronAuthorized(request)
  } catch (e) {
    return unauthorizedResponse(e)
  }
  return drainWalletProvisioningBatch()
}

/** Same as POST — Vercel Cron invokes routes with GET. */
export async function GET(request: Request) {
  try {
    assertInternalCronAuthorized(request)
  } catch (e) {
    return unauthorizedResponse(e)
  }
  return drainWalletProvisioningBatch()
}

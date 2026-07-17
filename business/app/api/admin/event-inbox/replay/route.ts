import { NextResponse } from "next/server"
import { requireOfficeAdmin } from "@/lib/api/admin-auth"
import {
  replayFailedEventInbox,
  replayStaleReceivedEventInbox,
} from "@/lib/webhooks/replay-event-inbox"

export const runtime = "nodejs"

type ReplayBody = {
  limit?: number
  provider?: "noah" | "yellowcard" | "turnkey" | "all"
  includeStaleReceived?: boolean
  minAgeMinutes?: number
}

const PROVIDERS = ["noah", "yellowcard", "turnkey"] as const

export async function POST(request: Request) {
  const auth = await requireOfficeAdmin(request)
  if (!auth.ok) return auth.response

  const body = (await request.json().catch(() => null)) as ReplayBody | null
  const limit = Math.min(200, Math.max(1, Number(body?.limit || 50)))
  const provider = body?.provider ?? "noah"
  const includeStaleReceived = body?.includeStaleReceived === true
  const minAgeMinutes = Math.max(1, Number(body?.minAgeMinutes || 5))

  try {
    if (provider !== "all") {
      const { replayed, failed } = await replayFailedEventInbox(provider, limit)
      let staleReplayed = 0
      let staleFailed = 0
      if (includeStaleReceived) {
        const stale = await replayStaleReceivedEventInbox(provider, limit, minAgeMinutes)
        staleReplayed = stale.replayed
        staleFailed = stale.failed
      }
      return NextResponse.json({
        ok: true,
        provider,
        replayed,
        failed,
        staleReplayed,
        staleFailed,
      })
    }

    let replayed = 0
    let failed = 0
    let staleReplayed = 0
    let staleFailed = 0
    for (const p of PROVIDERS) {
      const res = await replayFailedEventInbox(p, limit)
      replayed += res.replayed
      failed += res.failed
      if (includeStaleReceived) {
        const stale = await replayStaleReceivedEventInbox(p, limit, minAgeMinutes)
        staleReplayed += stale.replayed
        staleFailed += stale.failed
      }
    }

    return NextResponse.json({
      ok: true,
      provider: "all",
      replayed,
      failed,
      staleReplayed,
      staleFailed,
    })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    )
  }
}

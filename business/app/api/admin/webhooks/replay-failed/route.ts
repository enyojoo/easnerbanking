import { NextResponse } from "next/server"
import { requireOfficeAdmin } from "@/lib/api/admin-auth"
import { replayFailedNoahEventInbox } from "@/lib/webhooks/replay-event-inbox"

/** @deprecated Prefer `POST /api/admin/event-inbox/replay` — same behavior (event_inbox). */
export async function POST(request: Request) {
  const auth = await requireOfficeAdmin(request)
  if (!auth.ok) return auth.response
  const body = (await request.json().catch(() => null)) as { limit?: number } | null
  const limit = Math.min(200, Math.max(1, Number(body?.limit || 25)))

  try {
    const { replayed, failed } = await replayFailedNoahEventInbox(limit)
    return NextResponse.json({ ok: true, replayed, failed })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    )
  }
}

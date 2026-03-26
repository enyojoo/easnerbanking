import { NextResponse } from "next/server"
import { noahFetch } from "@/lib/noah/http"
import { requireAuth, requireNoahEnv, resolveNoahContext } from "../_helpers"

type TxResp = { Items?: Array<Record<string, unknown>>; PageToken?: string }

/** Mobile calls this to nudge refresh; Noah is source of truth — no local sync table yet. */
export async function POST(request: Request) {
  const mis = requireNoahEnv()
  if (mis) return mis
  const auth = await requireAuth(request)
  if ("error" in auth) return auth.error
  const { user } = auth
  const ctx = resolveNoahContext(user.id, request)
  const { noahCustomerId } = ctx

  try {
    let count = 0
    let token: string | undefined
    for (let i = 0; i < 5; i++) {
      const data = await noahFetch<TxResp>({
        method: "GET",
        path: "/transactions",
        query: { PageSize: 50, SortDirection: "DESC", ...(token ? { PageToken: token } : {}) },
      })
      const items = data.Items ?? []
      count += items.filter((tx) => String(tx.CustomerID ?? "") === noahCustomerId).length
      token = data.PageToken
      if (!token || items.length === 0) break
    }
    return NextResponse.json({ ok: true, synced: count })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ ok: false, error: msg }, { status: 400 })
  }
}

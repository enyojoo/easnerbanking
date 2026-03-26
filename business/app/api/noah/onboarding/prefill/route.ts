import { NextResponse } from "next/server"
import { noahFetch } from "@/lib/noah/http"
import { requireAuth, requireNoahEnv, resolveNoahContext } from "../../_helpers"

/**
 * Token Share — POST /v1/onboarding/:CustomerID/prefill (Sumsub)
 * @see https://docs.noah.com/recipes/onboarding/token-share-onboarding/
 */
export async function POST(request: Request) {
  const mis = requireNoahEnv()
  if (mis) return mis
  const auth = await requireAuth(request)
  if ("error" in auth) return auth.error
  const { user } = auth

  let body: { token: string; type?: string } = { token: "" }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  if (!body.token || typeof body.token !== "string") {
    return NextResponse.json({ error: "token is required" }, { status: 400 })
  }

  const ctx = resolveNoahContext(user.id, request, body.type)

  try {
    const data = await noahFetch<Record<string, unknown>>({
      method: "POST",
      path: `/onboarding/${encodeURIComponent(ctx.noahCustomerId)}/prefill`,
      json: {
        Type: "SumSubToken",
        Token: body.token,
      },
    })
    return NextResponse.json({ success: true, data, noahScope: ctx.scope })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 400 })
  }
}

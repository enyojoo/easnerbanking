import { leftoverApiRedirectUrl } from "@/lib/leftover-api-redirect"
import { collectHostnameCandidates } from "@/lib/api-subdomain-redirect"
import { type NextRequest, NextResponse } from "next/server"

async function redirectToApi(request: NextRequest, path: string[] | undefined) {
  const dest = leftoverApiRedirectUrl(request.url, path, collectHostnameCandidates(request))
  if (!dest) {
    return NextResponse.json({ error: "API is not on this host" }, { status: 404 })
  }
  /** 307 — do not permanently cache; a 308 here loops Chrome when api/js hit this UI. */
  return NextResponse.redirect(dest, 307)
}

type Ctx = { params: Promise<{ path?: string[] }> }

export async function GET(request: NextRequest, ctx: Ctx) {
  return redirectToApi(request, (await ctx.params).path)
}
export async function POST(request: NextRequest, ctx: Ctx) {
  return redirectToApi(request, (await ctx.params).path)
}
export async function PUT(request: NextRequest, ctx: Ctx) {
  return redirectToApi(request, (await ctx.params).path)
}
export async function PATCH(request: NextRequest, ctx: Ctx) {
  return redirectToApi(request, (await ctx.params).path)
}
export async function DELETE(request: NextRequest, ctx: Ctx) {
  return redirectToApi(request, (await ctx.params).path)
}
export async function OPTIONS(request: NextRequest, ctx: Ctx) {
  return redirectToApi(request, (await ctx.params).path)
}

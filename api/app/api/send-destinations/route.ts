import { NextResponse } from "next/server"
import { createSupabaseAdmin, getUserFromApiRequest } from "@/lib/supabase/admin"
import { loadUserRoutingSurface } from "@/lib/corridor-routing-surface"
import { buildSendDestinationsCatalog } from "@/lib/send-destinations/build-catalog"

export const runtime = "nodejs"

export async function GET(request: Request) {
  const user = await getUserFromApiRequest(request)
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const annotateProviders =
    searchParams.get("annotateProviders") === "true" || searchParams.get("annotateNoah") === "true"
  const executableOnly = searchParams.get("executable") === "true"
  const surface = await loadUserRoutingSurface(createSupabaseAdmin(), user.id)

  try {
    const { body, etag } = await buildSendDestinationsCatalog({
      annotateProviders,
      executableOnly,
      surface,
    })
    const inm = request.headers.get("if-none-match")
    if (inm && inm === etag) {
      return new NextResponse(null, {
        status: 304,
        headers: {
          ETag: etag,
          "Cache-Control": "no-store",
        },
      })
    }

    return NextResponse.json(body, {
      headers: {
        ETag: etag,
        "Cache-Control": "no-store",
      },
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

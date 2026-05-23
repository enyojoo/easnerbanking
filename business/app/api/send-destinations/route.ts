import { NextResponse } from "next/server"
import { getUserFromApiRequest } from "@/lib/supabase/admin"
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

  try {
    const { body, etag } = await buildSendDestinationsCatalog({ annotateProviders, executableOnly })
    const inm = request.headers.get("if-none-match")
    if (inm && inm === etag) {
      return new NextResponse(null, {
        status: 304,
        headers: {
          ETag: etag,
          "Cache-Control": "private, max-age=60, stale-while-revalidate=300",
        },
      })
    }

    return NextResponse.json(body, {
      headers: {
        ETag: etag,
        "Cache-Control": "private, max-age=60, stale-while-revalidate=300",
      },
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

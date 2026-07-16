import { NextResponse } from "next/server"

export const runtime = "nodejs"

/** Deprecated — use POST /cross-border/quote with sourcePhone + networkId. */
export async function POST() {
  return NextResponse.json(
    {
      ok: false,
      code: "deprecated",
      message: "Cross-border authorize deprecated. Use POST /api/yellowcard/cross-border/quote with sourcePhone and networkId.",
    },
    { status: 410 },
  )
}

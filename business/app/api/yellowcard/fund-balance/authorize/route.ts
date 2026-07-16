import { NextResponse } from "next/server"

export const runtime = "nodejs"

/** Deprecated — use POST /fund-balance/quote with sourcePhone + networkId. */
export async function POST() {
  return NextResponse.json(
    {
      ok: false,
      code: "deprecated",
      message: "MoMo authorize flow deprecated. Use POST /api/yellowcard/fund-balance/quote with sourcePhone and networkId.",
    },
    { status: 410 },
  )
}

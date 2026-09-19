import { NextResponse } from "next/server"

export const runtime = "nodejs"

/** Identity verification is presented by the client SDK. */
export async function POST() {
  return NextResponse.json(
    { error: "Verify identity in the setup window." },
    { status: 410 },
  )
}

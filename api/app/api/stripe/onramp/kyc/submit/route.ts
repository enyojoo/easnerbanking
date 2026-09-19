import { NextResponse } from "next/server"

export const runtime = "nodejs"

/** KYC is submitted from the client SDK. */
export async function POST() {
  return NextResponse.json(
    { error: "Submit identity details in the setup window." },
    { status: 410 },
  )
}

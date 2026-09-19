import { NextResponse } from "next/server"
import { resolveRequestClientIp } from "@/lib/stripe/request-client-ip"

export const runtime = "nodejs"

/** Returns the caller IP as seen by the API (for mobile onramp checkout). */
export async function GET(request: Request) {
  return NextResponse.json({ ip: resolveRequestClientIp(request) })
}

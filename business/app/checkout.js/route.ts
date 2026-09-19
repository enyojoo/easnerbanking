import { NextResponse, type NextRequest } from "next/server"
import { collectHostnameCandidates } from "@/lib/api-subdomain-redirect"
import { leftoverCheckoutJsRedirectUrl } from "@/lib/leftover-api-redirect"

/** Leftover UI-host hits → API checkout script. */
export function GET(request: NextRequest) {
  const dest = leftoverCheckoutJsRedirectUrl(request.url, collectHostnameCandidates(request))
  if (!dest) {
    return new NextResponse("Checkout script is not on this host", { status: 404 })
  }
  return NextResponse.redirect(dest, 307)
}

import { NextResponse } from "next/server"
import { apiUrl } from "@/lib/api-base-url"

/** Leftover UI-host hits → js/api checkout script. */
export function GET(request: Request) {
  const dest = new URL(apiUrl("/checkout.js"))
  if (dest.origin === new URL(request.url).origin) {
    return new NextResponse("Checkout script is not on this host", { status: 404 })
  }
  return NextResponse.redirect(dest, 308)
}

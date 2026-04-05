import { NextResponse } from "next/server"
import { getUserFromApiRequest } from "@/lib/supabase/admin"
import { getAllowedBaseCurrencyOptions } from "@/lib/accounts/currency-controls"

/** Business app: fiat options for **base currency** (office `system_settings`), no Noah tier guard — safe for onboarding. */
export async function GET(request: Request) {
  const user = await getUserFromApiRequest(request)
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const currencies = await getAllowedBaseCurrencyOptions()
  return NextResponse.json({ currencies })
}

import { NextResponse } from "next/server"
import { requireAuth } from "@/app/api/noah/_helpers"
import { listYellowcardChannels } from "@/lib/yellowcard/channels"
import { listYellowcardNetworks } from "@/lib/yellowcard/networks"
import { findYcReceiveChannel } from "@/lib/yellowcard/receive-rails"

export const runtime = "nodejs"

/** MoMo networks for YC pay-in (scoped to receive channel when available). */
export async function GET(request: Request) {
  const auth = await requireAuth(request)
  if ("error" in auth) return auth.error

  const url = new URL(request.url)
  const country = String(url.searchParams.get("country") ?? "").trim().toUpperCase()
  const currency = String(url.searchParams.get("currency") ?? "").trim().toUpperCase()
  if (!country || !currency) {
    return NextResponse.json({ error: "country and currency required" }, { status: 400 })
  }

  const channels = await listYellowcardChannels()
  const channel = findYcReceiveChannel(channels, {
    country,
    currency,
    rail: "mobile_money",
  })
  const channelId = String(channel?.id ?? channel?.channelId ?? "").trim()

  let rows = await listYellowcardNetworks({ country, currency })
  rows = rows.filter((n) => String(n.status ?? "").toLowerCase() !== "inactive")

  if (channelId) {
    const scoped = rows.filter(
      (n) =>
        Array.isArray(n.channelIds) &&
        n.channelIds.some((id) => String(id).trim() === channelId),
    )
    if (scoped.length > 0) rows = scoped
  }

  const networks = rows
    .map((n) => ({
      id: String(n.id ?? n.networkId ?? "").trim(),
      name: String(n.name ?? n.code ?? "").trim(),
    }))
    .filter((n) => n.id && n.name)

  return NextResponse.json({ networks })
}

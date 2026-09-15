/**
 * Compare stored YC MoMo pickers to live send-channel networks + logo coverage.
 * Usage: node --env-file=.env.local --import tsx scripts/compare-yc-momo.ts
 */
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import {
  hasMobileMoneyProviderIcon,
  normalizeMobileMoneyProviderKey,
  resolveCorridorRecipientOptions,
  resolvePrimaryPayoutProvider,
} from "@easner/shared"
import { findYcCorridorChannel } from "@/lib/payout-providers/yellowcard-provider"
import { listYellowcardNetworks } from "@/lib/yellowcard/networks"
import { readYcChannelId } from "@/lib/yellowcard/channels"

function liveMomoNames(
  networks: Array<{
    name?: string
    code?: string
    status?: string
    channelIds?: string[]
  }>,
  channelId: string,
): string[] {
  return [
    ...new Set(
      networks
        .filter((n) => {
          const status = String(n.status ?? "").trim().toLowerCase()
          if (status === "inactive" || status === "disabled") return false
          const name = String(n.name ?? n.code ?? "").trim()
          if (!name || name.toLowerCase().includes("manual input")) return false
          if (!channelId) return true
          return Array.isArray(n.channelIds) && n.channelIds.some((id) => String(id).trim() === channelId)
        })
        .map((n) => String(n.name ?? n.code ?? "").trim())
        .filter(Boolean),
    ),
  ].sort((a, b) => a.localeCompare(b))
}

async function main() {
  const admin = createSupabaseAdmin()
  const { data: rows, error } = await admin
    .from("payout_corridors")
    .select("country_code,currency_code,rail,provider_routing,fields_schema,providers")
    .eq("rail", "mobile_money")
    .order("country_code")
  if (error) {
    console.error(error)
    process.exit(1)
  }

  const summaries = []
  for (const row of rows ?? []) {
    const routing = Array.isArray(row.provider_routing) ? row.provider_routing : []
    const usesYc = routing.some(
      (e) => String((e as { provider?: string }).provider ?? "").toLowerCase() === "yellowcard",
    )
    if (!usesYc) continue

    const code = String(row.country_code ?? "").toUpperCase()
    const currency = String(row.currency_code ?? "").toUpperCase()
    const primary = resolvePrimaryPayoutProvider(row.provider_routing)
    const networks = await listYellowcardNetworks({ country: code, currency })
    const sendChannel = await findYcCorridorChannel({
      countryCode: code,
      currencyCode: currency,
      rail: "mobile_money",
      includeInactive: true,
      networks,
    })
    const channelId = readYcChannelId(sendChannel) ?? ""
    const live = liveMomoNames(networks, channelId)
    const schema = (row.fields_schema ?? {}) as Record<string, unknown>
    const yc = schema.yellowcard as Record<string, unknown> | undefined
    const stored = Array.isArray(yc?.momo_provider_enum)
      ? (yc.momo_provider_enum as Array<{ value?: string; label?: string }>)
          .map((e) => String(e.label || e.value || "").trim())
          .filter(Boolean)
          .sort((a, b) => a.localeCompare(b))
      : []
    const picker = resolveCorridorRecipientOptions({
      countryCode: code,
      currencyCode: currency,
      rail: "mobile_money",
      fieldsSchema: row.fields_schema,
      providers: row.providers,
      payoutProvider: primary,
    }).momoOptions

    summaries.push({
      country: code,
      currency,
      primary,
      sendChannel: sendChannel
        ? {
            id: channelId,
            type: sendChannel.channelType ?? null,
            status: sendChannel.status ?? sendChannel.apiStatus ?? null,
            ramp: sendChannel.rampType ?? sendChannel.type ?? null,
          }
        : null,
      stored,
      live,
      picker,
      extraVsLive: picker.filter((b) => !live.includes(b)),
      missingVsLive: live.filter((b) => !picker.includes(b)),
      logos: picker.map((label) => ({
        label,
        icon: normalizeMobileMoneyProviderKey(label) ?? null,
        hasLogo: hasMobileMoneyProviderIcon(label),
      })),
    })
  }

  console.log(JSON.stringify(summaries, null, 2))
}

void main()

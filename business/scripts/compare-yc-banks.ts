/**
 * Compare stored YC bank pickers to live send-channel networks.
 * Usage: YC_SCHEMA_SYNC_COUNTRY=GH,KE,RW node --env-file=.env.local --import tsx scripts/compare-yc-banks.ts
 */
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { resolveCorridorRecipientOptions, resolvePrimaryPayoutProvider } from "@easner/shared"
import { findYcCorridorChannel } from "@/lib/payout-providers/yellowcard-provider"
import { listYellowcardNetworks } from "@/lib/yellowcard/networks"
import { listYellowcardChannels } from "@/lib/yellowcard/channels"

const COUNTRIES: Array<{ code: string; currency: string }> = [
  { code: "GH", currency: "GHS" },
  { code: "KE", currency: "KES" },
  { code: "RW", currency: "RWF" },
]

function liveBankNames(
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
  const filter = new Set(
    String(process.env.YC_SCHEMA_SYNC_COUNTRY ?? "")
      .split(",")
      .map((c) => c.trim().toUpperCase())
      .filter(Boolean),
  )
  const targets = COUNTRIES.filter((c) => !filter.size || filter.has(c.code))
  const admin = createSupabaseAdmin()
  const allChannels = await listYellowcardChannels()

  for (const { code, currency } of targets) {
    const { data: row, error } = await admin
      .from("payout_corridors")
      .select("id, country_code, currency_code, rail, provider_routing, fields_schema")
      .eq("country_code", code)
      .eq("currency_code", currency)
      .eq("rail", "bank_transfer")
      .maybeSingle()

    const sendChannel = await findYcCorridorChannel({
      countryCode: code,
      currencyCode: currency,
      rail: "bank_transfer",
      includeInactive: true,
    })
    const channelId = String(sendChannel?.id ?? sendChannel?.channelId ?? "").trim()
    const networks = await listYellowcardNetworks({ country: code, currency })
    const live = liveBankNames(networks, channelId)
    const schema = (row?.fields_schema ?? {}) as Record<string, unknown>
    const yc = schema.yellowcard as Record<string, unknown> | undefined
    const noah = schema.noah as Record<string, unknown> | undefined
    const stored = Array.isArray(yc?.bank_enum) ? ([...yc.bank_enum] as string[]).sort((a, b) => a.localeCompare(b)) : []
    const noahBanks = Array.isArray(noah?.bank_enum) ? (noah.bank_enum as string[]) : []
    const primary = row ? resolvePrimaryPayoutProvider(row.provider_routing) : null
    const picker = row
      ? resolveCorridorRecipientOptions({
          countryCode: code,
          currencyCode: currency,
          rail: "bank_transfer",
          fieldsSchema: row.fields_schema,
          payoutProvider: primary,
        }).bankOptions
      : []

    const countryChannels = allChannels
      .filter((ch) => String(ch.country ?? "").toUpperCase() === code)
      .map((ch) => ({
        id: ch.id ?? ch.channelId ?? null,
        type: ch.channelType ?? null,
        ramp: ch.rampType ?? ch.type ?? null,
        status: ch.status ?? ch.apiStatus ?? null,
        currency: ch.currency ?? null,
      }))

    console.log(
      JSON.stringify(
        {
          country: code,
          currency,
          corridorError: error?.message ?? null,
          primary,
          sendChannel: sendChannel
            ? {
                id: channelId,
                type: sendChannel.channelType ?? sendChannel.type ?? null,
                status: sendChannel.status ?? null,
                ramp: sendChannel.rampType ?? sendChannel.type ?? null,
              }
            : null,
          countryChannels,
          storedYcCount: stored.length,
          liveCount: live.length,
          extraVsLive: stored.filter((b) => !live.includes(b)),
          missingVsLive: live.filter((b) => !stored.includes(b)),
          noahBankEnumCount: noahBanks.length,
          pickerCount: picker.length,
          pickerExtraVsLive: picker.filter((b) => !live.includes(b)),
          pickerMissingVsLive: live.filter((b) => !picker.includes(b)),
          live,
        },
        null,
        2,
      ),
    )
  }
}

void main()

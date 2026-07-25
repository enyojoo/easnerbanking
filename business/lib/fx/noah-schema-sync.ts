import type { SupabaseClient } from "@supabase/supabase-js"
import {
  unwrapGridFieldsSchema,
  unwrapNoahFieldsSchema,
  unwrapYcFieldsSchema,
  type PayoutFieldsSchemaHint,
} from "@easner/shared"
import { noahFetch } from "@/lib/noah/http"
import { fetchSellChannelItems, getNoahSettlementCryptoCurrency } from "@/lib/noah/payout-prepare"
import {
  mobileProviderLabelsFromSellItems,
  normalizeFormSchemaHints,
  pickChannelForRail,
} from "@/lib/noah/form-schema-hints"
import { isExcludedPayoutCorridorCountry } from "@/lib/payout-corridors-exclusions"
import { mergeCorridorProvidersColumn } from "@/lib/fx/corridor-providers-merge"
import type { ProviderSchemaSyncResult } from "@/lib/fx/provider-schema-sync-types"

type CorridorRow = {
  id: string
  country_code: string
  currency_code: string
  rail: string
  fields_schema?: unknown
  providers?: unknown
}

function corridorKey(country: string, currency: string, rail: string): string {
  return `${country.toUpperCase()}:${currency.toUpperCase()}:${rail === "mobile_money" ? "mobile_money" : "bank_transfer"}`
}

function nestedFieldsSchema(
  prior: unknown,
  noah: PayoutFieldsSchemaHint,
): { noah: PayoutFieldsSchemaHint; yellowcard: unknown; grid: unknown } {
  const priorYc = unwrapYcFieldsSchema(prior)
  const priorGrid = unwrapGridFieldsSchema(prior)
  return {
    noah,
    yellowcard: priorYc ?? null,
    grid: priorGrid ?? null,
  }
}

/** Refresh fields_schema.noah (and MoMo providers) from live Noah sell channels. */
export async function syncNoahCorridorSchemas(
  admin: SupabaseClient,
): Promise<ProviderSchemaSyncResult> {
  const settlement = getNoahSettlementCryptoCurrency()
  const { data: rows, error: rowsErr } = await admin
    .from("payout_corridors")
    .select("id,country_code,currency_code,rail,fields_schema,providers")

  if (rowsErr) return { ok: false, updated: 0, skipped: 0, error: rowsErr.message }

  const rowByKey = new Map<string, CorridorRow>()
  for (const row of rows ?? []) {
    rowByKey.set(
      corridorKey(String(row.country_code), String(row.currency_code), String(row.rail)),
      row as CorridorRow,
    )
  }

  let countriesMap: Record<string, string[]>
  try {
    countriesMap = await noahFetch<Record<string, string[]>>({
      method: "GET",
      path: "/channels/sell/countries",
    })
  } catch (e) {
    return {
      ok: false,
      updated: 0,
      skipped: 0,
      error: e instanceof Error ? e.message : String(e),
    }
  }

  let updated = 0
  let skipped = 0

  for (const [country, fiats] of Object.entries(countriesMap)) {
    if (!Array.isArray(fiats)) continue
    const cc = country.toUpperCase()
    if (isExcludedPayoutCorridorCountry(cc)) continue

    for (const fiat of [...new Set(fiats.map((f) => f.toUpperCase()))]) {
      let items
      try {
        items = await fetchSellChannelItems({
          country: cc,
          fiatCurrency: fiat,
          cryptoCurrency: settlement,
        })
      } catch {
        skipped++
        continue
      }
      if (items.length === 0) {
        skipped++
        continue
      }

      const hasIdentifier = items.some(
        (x) => String(x.PaymentMethodCategory ?? "") === "Identifier",
      )
      const rails: Array<"bank_transfer" | "mobile_money"> = hasIdentifier
        ? ["bank_transfer", "mobile_money"]
        : ["bank_transfer"]

      for (const rail of rails) {
        const key = corridorKey(cc, fiat, rail)
        const existing = rowByKey.get(key)
        if (!existing) {
          skipped++
          continue
        }

        const pick = pickChannelForRail(items, rail)
        if (!pick?.FormSchema) {
          skipped++
          continue
        }

        const noahHints = normalizeFormSchemaHints(pick)
        const mobileLabels =
          rail === "mobile_money" ? mobileProviderLabelsFromSellItems(items, cc) : []
        if (mobileLabels.length > 0) {
          noahHints.mobile_provider_labels = mobileLabels
        }

        const fields_schema = nestedFieldsSchema(existing.fields_schema, noahHints)
        const updates: Record<string, unknown> = {
          fields_schema,
          updated_at: new Date().toISOString(),
        }
        if (rail === "mobile_money" && mobileLabels.length > 0) {
          updates.providers = mergeCorridorProvidersColumn(existing.providers, mobileLabels)
        }

        const { error: upErr } = await admin
          .from("payout_corridors")
          .update(updates)
          .eq("id", existing.id)
        if (upErr) skipped++
        else updated++
      }
    }
  }

  return { ok: true, updated, skipped }
}

export async function syncNoahCorridorSchemasSafe(
  admin: SupabaseClient,
): Promise<ProviderSchemaSyncResult> {
  try {
    return await syncNoahCorridorSchemas(admin)
  } catch (e) {
    return {
      ok: false,
      updated: 0,
      skipped: 0,
      error: e instanceof Error ? e.message : String(e),
    }
  }
}

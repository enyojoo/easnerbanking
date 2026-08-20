/**
 * Probe Noah local-currency offramp pricing vs merchant fee schedule.
 * Prod read-only: prepare only (no sell execute).
 *
 * Usage:
 *   cd business && node --env-file=.env.local --import tsx scripts/probe-noah-offramp-pricing.ts
 *
 * Env:
 *   PROBE_NOAH_CUSTOMER_ID – Noah business customer ID (required for prepare probes)
 *   PROBE_NOAH_RECIPIENT_ID – NGN bank recipient (Easner recipients.id)
 *   PROBE_NOAH_RECIPIENT_ID_RWF_BANK / PROBE_NOAH_RECIPIENT_ID_RWF_MOBILE – optional RW probes
 */

import { getNoahUsdCryptoTicker } from "../lib/noah/config"
import { noahFetch } from "../lib/noah/http"

type ProbeRow = Record<string, unknown>

const TICKETS: Record<string, number[]> = {
  NGN: [5000, 100_000, 500_000],
  KES: [5000, 100_000],
  RWF: [6000, 100_000],
}

/** Inline schedule for script runtime (avoids @easner/shared barrel via tsx). */
function probeScheduleFee(currency: string, basisAmount: number): number | null {
  if (!Number.isFinite(basisAmount) || basisAmount <= 0) return null
  const rows: Record<string, { fixed: number; pct: number }> = {
    NGN: { fixed: 0.5, pct: 0.005 },
    KES: { fixed: 1.25, pct: 0.0055 },
    RWF: { fixed: 1.25, pct: 0.0055 },
  }
  const row = rows[currency.trim().toUpperCase()]
  if (!row) return null
  return Math.round((row.fixed + row.pct * basisAmount) * 1_000_000) / 1_000_000
}

async function probePrices(
  destFiat: string,
  country: string,
  destAmount: number,
): Promise<ProbeRow> {
  const usdc = getNoahUsdCryptoTicker()
  const query: Record<string, string> = {
    SourceCurrency: usdc,
    DestinationCurrency: destFiat,
    Country: country,
    DestinationAmount: String(destAmount),
  }
  const raw = await noahFetch<{ Items?: Array<Record<string, unknown>> }>({
    method: "GET",
    path: "/prices",
    query,
  })
  const row = Array.isArray(raw.Items) ? raw.Items[0] : raw
  return { query, row: row ?? raw }
}

async function probeCorridor(input: {
  label: string
  recipientId: string
  customerId: string
  tickets: number[]
}): Promise<ProbeRow[]> {
  const [
    { createSupabaseAdmin },
    { findNoahRate, listNoahRates },
    { fetchSellChannelItems },
    { noahImpliedProviderRate },
    { prepareSellFromRecipientRow },
    { computeGlobalPayoutPricing },
    { computeNoahOfframpScheduleFee, resolveNoahOfframpPaymentMethodKey },
  ] = await Promise.all([
    import("../lib/supabase/admin"),
    import("../lib/fx/noah-rates"),
    import("../lib/noah/payout-prepare"),
    import("../lib/noah/fx-prices"),
    import("../lib/terminal/recipient-sell-prepare"),
    import("../../packages/shared/src/global-payout-pricing"),
    import("../lib/noah/noah-offramp-fee-schedule"),
  ])

  const admin = createSupabaseAdmin()
  const { data, error } = await admin.from("recipients").select("*").eq("id", input.recipientId).maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) throw new Error(`Recipient not found: ${input.recipientId}`)
  const row = data

  const receiveCurrency = String(row.currency || "").toUpperCase()
  const country = String(row.country_code || "").toUpperCase()
  const crypto = getNoahUsdCryptoTicker()
  const dbRates = await listNoahRates(admin, { destinations: [receiveCurrency], status: "active" })
  const dbRow = findNoahRate(dbRates, "USD", receiveCurrency)
  const channels = await fetchSellChannelItems({
    country,
    fiatCurrency: receiveCurrency,
    cryptoCurrency: crypto,
  })
  const paymentMethodKey = resolveNoahOfframpPaymentMethodKey({
    bankName: row.bank_name,
    mobileProvider: row.mobile_provider,
  })

  const out: ProbeRow[] = []

  for (const ticket of input.tickets) {
    try {
      const prep = await prepareSellFromRecipientRow({
        row,
        fiatAmount: ticket,
        cryptoCurrency: crypto,
        noahCustomerId: input.customerId,
      })

      const noahFloor = Number.parseFloat(String(prep.prep.cryptoAuthorizedAmount || ""))
      const dbMid = dbRow?.noah_mid ?? 0
      const customerRate = dbRow?.rate ?? 0

      let ticketMid = dbMid
      if (Number.isFinite(noahFloor) && noahFloor > 0) {
        try {
          ticketMid = await noahImpliedProviderRate({
            sourceCurrency: "USD",
            destinationCurrency: receiveCurrency,
            sourceAmount: noahFloor,
            country,
          })
        } catch {
          // keep db mid
        }
      }

      const pricingDb = computeGlobalPayoutPricing({
        receiveAmount: ticket,
        customerRate,
        noahMid: dbMid,
        noahFloor,
        ...(prep.prep.channelFee != null ? { prepareChannelFee: prep.prep.channelFee } : {}),
        ...(prep.prep.remaining != null ? { prepareRemaining: prep.prep.remaining } : {}),
      })

      const pricingTicket = computeGlobalPayoutPricing({
        receiveAmount: ticket,
        customerRate,
        noahMid: ticketMid,
        noahFloor,
        ...(prep.prep.channelFee != null ? { prepareChannelFee: prep.prep.channelFee } : {}),
        ...(prep.prep.remaining != null ? { prepareRemaining: prep.prep.remaining } : {}),
      })

      const scheduleFee = computeNoahOfframpScheduleFee({
        currency: receiveCurrency,
        countryCode: country,
        paymentMethodKey,
        basisAmount: noahFloor,
      })

      out.push({
        label: input.label,
        ticket,
        country,
        currency: receiveCurrency,
        paymentMethodKey,
        channelCount: channels.length,
        noahFloor,
        prepTotalFee: prep.prep.totalFee ?? null,
        prepChannelFee: prep.prep.channelFee ?? null,
        prepRemaining: prep.prep.remaining ?? null,
        dbNoahMid: dbMid,
        ticketNoahMid: ticketMid,
        customerRate,
        channelCostDbMid: pricingDb.channelCost,
        channelCostTicketMid: pricingTicket.channelCost,
        totalDebited: pricingTicket.totalDebited,
        youSend: pricingTicket.customerPrincipal,
        scheduleFee,
        deltaChannelVsSchedule:
          scheduleFee != null ? pricingTicket.channelCost - scheduleFee : null,
        prepareRawKeys: Object.keys(prep.prep.raw || {}),
        hasBreakdown: Array.isArray(prep.prep.raw?.Breakdown),
      })
    } catch (e) {
      out.push({
        label: input.label,
        ticket,
        error: e instanceof Error ? e.message : String(e),
      })
    }
  }

  return out
}

async function main() {
  const customerId = process.env.PROBE_NOAH_CUSTOMER_ID?.trim()
  const ngnRecipient = process.env.PROBE_NOAH_RECIPIENT_ID?.trim()
  const results: ProbeRow[] = []

  if (ngnRecipient && customerId) {
    results.push(
      ...(await probeCorridor({
        label: "NGN bank",
        recipientId: ngnRecipient,
        customerId,
        tickets: TICKETS.NGN,
      })),
    )
  } else {
    console.warn("Skip NGN prepare – set PROBE_NOAH_CUSTOMER_ID + PROBE_NOAH_RECIPIENT_ID")
    for (const ticket of TICKETS.NGN) {
      try {
        const prices = await probePrices("NGN", "NG", ticket)
        const row = prices.row as Record<string, unknown> | undefined
        const noahFloor = Number(row?.SourceAmount)
        results.push({
          label: "NGN prices-only",
          ticket,
          ...prices,
          scheduleFee: probeScheduleFee("NGN", noahFloor),
          totalFee: row?.TotalFee ?? null,
          rate: row?.Rate ?? null,
          sourceAmount: row?.SourceAmount ?? null,
        })
      } catch (e) {
        results.push({
          label: "NGN prices-only",
          ticket,
          error: e instanceof Error ? e.message : String(e),
        })
      }
    }
  }

  for (const [cur, cc, tickets] of [
    ["KES", "KE", TICKETS.KES],
    ["RWF", "RW", TICKETS.RWF],
  ] as const) {
    for (const ticket of tickets) {
      try {
        const prices = await probePrices(cur, cc, ticket)
        const row = prices.row as Record<string, unknown> | undefined
        const noahFloor = Number(row?.SourceAmount)
        results.push({
          label: `${cur} prices-only`,
          ticket,
          ...prices,
          scheduleFee: probeScheduleFee(cur, noahFloor),
          totalFee: row?.TotalFee ?? null,
          rate: row?.Rate ?? null,
          sourceAmount: row?.SourceAmount ?? null,
        })
      } catch (e) {
        results.push({
          label: `${cur} prices-only`,
          ticket,
          error: e instanceof Error ? e.message : String(e),
        })
      }
    }
  }

  if (customerId) {
    const rwfBank = process.env.PROBE_NOAH_RECIPIENT_ID_RWF_BANK?.trim()
    if (rwfBank) {
      results.push(
        ...(await probeCorridor({
          label: "RWF bank",
          recipientId: rwfBank,
          customerId,
          tickets: TICKETS.RWF,
        })),
      )
    }

    const rwfMobile = process.env.PROBE_NOAH_RECIPIENT_ID_RWF_MOBILE?.trim()
    if (rwfMobile) {
      results.push(
        ...(await probeCorridor({
          label: "RWF mobile",
          recipientId: rwfMobile,
          customerId,
          tickets: TICKETS.RWF,
        })),
      )
    }
  }

  console.log(JSON.stringify({ probedAt: new Date().toISOString(), results }, null, 2))
}

void main().catch((e) => {
  console.error(e)
  process.exit(1)
})

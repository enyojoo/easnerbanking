import { computeDisplayProcessingFee, normalizeGlobalPayoutQuoteReceiveAmount, normalizePayoutReceiveAmountForCurrency } from "@easner/shared"
import { buildPayoutQuote } from "@/lib/noah/payout-quote"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { findNoahRate, listNoahRates } from "@/lib/fx/noah-rates"

const fixture = {
  country_code: "ID",
  full_name: "Probe User",
  account_number: "1234567890",
  bank_name: "Bank Mandiri",
  swift_bic: "BMRIIDJA",
  phone_number: "+6281234567890",
  currency: "IDR",
}

async function main() {
  const admin = createSupabaseAdmin()
  const dbRow = findNoahRate(
    await listNoahRates(admin, { destinations: ["IDR"], status: "active" }),
    "USD",
    "IDR",
  )
  const customerRate = dbRow?.rate ?? 0
  if (!customerRate) throw new Error("no USD/IDR rate")

  for (const sendBudget of [100, 500, 1000, 5000]) {
    const receiveFiatAmount = normalizeGlobalPayoutQuoteReceiveAmount({
      amountEntryMode: "send",
      receiveFiatAmount: 0,
      sendBudget,
      customerRate,
      receiveCurrency: "IDR",
      normalizeReceive: normalizePayoutReceiveAmountForCurrency,
    })
    try {
      const q = await buildPayoutQuote({
        userId: "c7ace38e-be38-43e7-86e1-6e66b90d4243",
        noahCustomerId: "eind_c7ace38ebe3843e786e16e66b90d4243",
        recipient: fixture,
        receiveFiatAmount,
        sourceBalanceCurrency: "USD",
        amountEntryMode: "send",
        sendBudget,
        prepareOverrides: { paymentPurpose: "Family Maintenance" },
      })
      const fee = computeDisplayProcessingFee({
        processingFee: q.processingFee,
        exchangeFee: q.displayChannelCost,
      })
      console.log(
        JSON.stringify({
          ok: true,
          sendBudget,
          receive_IDR: q.receiveAmount,
          sending_USD: q.customerPrincipal,
          processingFee_UI: fee,
          totalDebited: q.totalDebited,
          integerReceive: Number.isInteger(q.receiveAmount),
        }),
      )
    } catch (e) {
      console.log(
        JSON.stringify({
          ok: false,
          sendBudget,
          error: e instanceof Error ? e.message : String(e),
        }),
      )
    }
  }
}

void main().catch((e) => {
  console.error(e)
  process.exit(1)
})

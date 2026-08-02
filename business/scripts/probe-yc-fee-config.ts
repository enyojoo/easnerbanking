/**
 * YC POST /fees/get-config — the authoritative service fee for a corridor.
 *
 * Send-leg sizing currently assumes a flat 1% (YC_SEND_LEG_SERVICE_FEE_FRACTION).
 * This probe reads the real config (minFeeLocal / feePercentage / flatFeeLocal) for
 * both settlement modes so lock sizing can stop guessing.
 *
 * Usage:
 *   cd business && node --env-file=.env.local --import tsx scripts/probe-yc-fee-config.ts
 */
import { yellowcardFetch } from "../lib/yellowcard/http"
import { getYellowcardEnvironment } from "../lib/yellowcard/config"

type FeeConfig = {
  serviceFee?: {
    minFeeLocal?: number
    feePercentage?: number
    flatFeeLocal?: number
  }
}

const CORRIDORS = [
  { country: "NG", currency: "NGN", channelType: "bank" as const },
  { country: "NG", currency: "NGN", channelType: "momo" as const },
  { country: "KE", currency: "KES", channelType: "bank" as const },
  { country: "KE", currency: "KES", channelType: "momo" as const },
  { country: "GH", currency: "GHS", channelType: "bank" as const },
  { country: "GH", currency: "GHS", channelType: "momo" as const },
  { country: "ZA", currency: "ZAR", channelType: "bank" as const },
]

/** Print the raw body — a 200 with no serviceFee is indistinguishable from a miss otherwise. */
const RAW = process.env.YC_PROBE_RAW === "1"

async function main() {
  console.log("=== YC fee config (POST /fees/get-config) ===")
  console.log("environment:", getYellowcardEnvironment(), "\n")
  console.log(
    "corridor".padEnd(22),
    "direct".padEnd(7),
    "minFeeLocal".padStart(12),
    "feePct".padStart(8),
    "flatFeeLocal".padStart(13),
  )

  for (const corridor of CORRIDORS) {
    for (const directSettlement of [true, false]) {
      const label = `${corridor.country}/${corridor.currency}/${corridor.channelType}`
      try {
        const res = await yellowcardFetch<FeeConfig>({
          method: "POST",
          path: "/fees/get-config",
          json: { txType: "send", ...corridor, directSettlement },
        })
        const fee = res.serviceFee ?? {}
        if (RAW) console.log(label, directSettlement, "raw:", JSON.stringify(res))
        console.log(
          label.padEnd(22),
          String(directSettlement).padEnd(7),
          String(fee.minFeeLocal ?? "—").padStart(12),
          String(fee.feePercentage ?? "—").padStart(8),
          String(fee.flatFeeLocal ?? "—").padStart(13),
        )
      } catch (e) {
        const err = e as { status?: number; message?: string }
        console.log(
          label.padEnd(22),
          String(directSettlement).padEnd(7),
          ` FAIL ${err.status ?? "?"} ${err.message ?? ""}`,
        )
      }
    }
  }

  console.log("\nNet local for a settlement crypto (directSettlement):")
  console.log("  gross = round(cryptoUsdCents, 2) * cryptoLocalRate")
  console.log("  fee   = max(minFeeLocal, gross * feePercentage) + flatFeeLocal")
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})

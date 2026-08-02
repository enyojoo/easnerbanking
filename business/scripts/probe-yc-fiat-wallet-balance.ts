/**
 * Does YC expose a fiat wallet balance endpoint? Needed to monitor a prefunded
 * float if balance payouts move to non-directSettlement exact-local sends.
 *
 * Read-only GETs; unknown paths simply 404.
 *
 * Usage:
 *   cd business && node --env-file=.env.local --import tsx scripts/probe-yc-fiat-wallet-balance.ts
 */
import { yellowcardFetch } from "../lib/yellowcard/http"
import { getYellowcardEnvironment } from "../lib/yellowcard/config"

const PATHS = [
  "/account",
  "/account/balances",
  "/account/balance",
  "/balances",
  "/balance",
  "/wallets",
  "/wallet",
  "/settlement/balances",
]

async function main() {
  console.log("=== YC fiat wallet balance discovery ===")
  console.log("environment:", getYellowcardEnvironment(), "\n")

  for (const path of PATHS) {
    try {
      const res = await yellowcardFetch<unknown>({ method: "GET", path })
      console.log(`${path.padEnd(24)} OK`, JSON.stringify(res).slice(0, 600))
    } catch (e) {
      const err = e as { status?: number; message?: string }
      console.log(`${path.padEnd(24)} ${err.status ?? "?"} ${err.message ?? ""}`)
    }
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})

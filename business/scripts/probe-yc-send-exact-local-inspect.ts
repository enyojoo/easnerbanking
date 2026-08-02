/**
 * Inspect the sends created by probe-yc-send-exact-local.ts (fees, settlement wallet, expiry).
 *
 * Usage:
 *   cd business && YC_PROBE_SEND_IDS=id1,id2 node --env-file=.env.local --import tsx \
 *     scripts/probe-yc-send-exact-local-inspect.ts
 */
import { yellowcardFetch } from "../lib/yellowcard/http"

const IDS = String(process.env.YC_PROBE_SEND_IDS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean)

async function main() {
  if (!IDS.length) throw new Error("Set YC_PROBE_SEND_IDS=comma,separated,ids")
  for (const id of IDS) {
    console.log("=".repeat(78))
    console.log(id)
    try {
      const res = await yellowcardFetch<Record<string, unknown>>({
        method: "GET",
        path: `/send/${id}`,
      })
      console.log(JSON.stringify(res, null, 2))
    } catch (e) {
      const err = e as { status?: number; message?: string; body?: unknown }
      console.log("ERR", err.status, err.message, JSON.stringify(err.body ?? null))
    }
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})

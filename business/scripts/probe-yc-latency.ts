/**
 * Probe Yellow Card API latency for all endpoints Easner uses.
 *
 * Usage:
 *   cd business && node --env-file=.env.local --import tsx scripts/probe-yc-latency.ts
 *
 * Optional:
 *   YC_PROBE_RUNS=3
 *   YC_PROBE_LIVE_QUOTES=1   – also POST /receive and /send (production locks quotes; use carefully)
 *   YC_PROBE_CUSTOMER_UID=…  – required for live quote probes
 */
import { randomUUID } from "crypto"
import { getYellowcardEnvironment, getYellowcardRelayUrl } from "../lib/yellowcard/config"
import { yellowcardFetch, YellowcardHttpError } from "../lib/yellowcard/http"
import { listYellowcardChannels } from "../lib/yellowcard/channels"
import { listYellowcardNetworks } from "../lib/yellowcard/networks"
import { listYellowcardRates } from "../lib/yellowcard/rates"
import { findYcReceiveChannel } from "../lib/yellowcard/receive-rails"
import { findYcSendChannel } from "../lib/payout-providers/yellowcard-provider"

const RUNS = Math.max(1, Number.parseInt(process.env.YC_PROBE_RUNS || "3", 10) || 3)
const LIVE_QUOTES = process.env.YC_PROBE_LIVE_QUOTES === "1"
const CUSTOMER_UID = String(process.env.YC_PROBE_CUSTOMER_UID || "").trim()

type TimedResult = {
  label: string
  method: string
  path: string
  runs: number[]
  statuses: number[]
  errors: string[]
}

function stats(ms: number[]) {
  const sorted = [...ms].sort((a, b) => a - b)
  const sum = sorted.reduce((a, b) => a + b, 0)
  const mid = sorted[Math.floor(sorted.length / 2)] ?? 0
  return {
    min: sorted[0] ?? 0,
    max: sorted[sorted.length - 1] ?? 0,
    avg: sorted.length ? Math.round(sum / sorted.length) : 0,
    p50: mid,
  }
}

async function timeCall<T>(
  label: string,
  method: "GET" | "POST" | "PUT",
  path: string,
  fn: () => Promise<T>,
): Promise<{ ms: number; status: number }> {
  const started = Date.now()
  try {
    await fn()
    return { ms: Date.now() - started, status: 200 }
  } catch (e) {
    const status = e instanceof YellowcardHttpError ? e.status : 0
    throw Object.assign(e instanceof Error ? e : new Error(String(e)), {
      __probeMs: Date.now() - started,
      __probeStatus: status,
      __probeLabel: label,
      __probeMethod: method,
      __probePath: path,
    })
  }
}

async function bench(
  label: string,
  method: "GET" | "POST" | "PUT",
  path: string,
  fn: () => Promise<unknown>,
): Promise<TimedResult> {
  const runs: number[] = []
  const statuses: number[] = []
  const errors: string[] = []

  for (let i = 0; i < RUNS; i++) {
    try {
      const { ms, status } = await timeCall(label, method, path, fn)
      runs.push(ms)
      statuses.push(status)
    } catch (e) {
      const err = e as Error & { __probeMs?: number; __probeStatus?: number }
      runs.push(err.__probeMs ?? 0)
      statuses.push(err.__probeStatus ?? 0)
      errors.push(err.message.slice(0, 160))
    }
  }

  return { label, method, path, runs, statuses, errors }
}

function printResult(r: TimedResult) {
  const s = stats(r.runs)
  const statusSummary = [...new Set(r.statuses)].join("/")
  const err = r.errors[0] ? ` | err: ${r.errors[0]}` : ""
  console.log(
    `${r.method.padEnd(4)} ${r.path.padEnd(28)} ${s.min}/${s.p50}/${s.max} ms (p50=${s.p50}, avg=${s.avg}) status=${statusSummary}${err}`,
  )
}

async function main() {
  console.log("=== YC API latency probe ===")
  console.log("environment:", getYellowcardEnvironment())
  console.log("relay:", getYellowcardRelayUrl() || "(direct – no relay)")
  console.log("runs per endpoint:", RUNS)
  console.log("live quote probes:", LIVE_QUOTES ? "yes" : "no (GET only)")
  console.log("")

  const results: TimedResult[] = []

  results.push(
    await bench("rates", "GET", "/rates", () => listYellowcardRates()),
  )
  results.push(
    await bench("channels", "GET", "/channels", () =>
      yellowcardFetch({ method: "GET", path: "/channels" }),
    ),
  )

  for (const country of ["NG", "KE"]) {
    results.push(
      await bench(`networks ${country}`, "GET", `/networks?country=${country}`, () =>
        listYellowcardNetworks({ country }),
      ),
    )
  }

  console.log("--- GET endpoints ---")
  for (const r of results) printResult(r)

  if (!LIVE_QUOTES) {
    console.log("\n--- POST endpoints (dummy payload – measures API round-trip; expect 4xx) ---")
    const channels = await listYellowcardChannels()
    const recv = channels.find(
      (c) =>
        c.country === "NG" &&
        c.currency === "NGN" &&
        c.rampType === "deposit" &&
        String(c.channelType || "").toLowerCase() === "bank",
    )
    const send = channels.find(
      (c) =>
        c.country === "KE" &&
        c.currency === "KES" &&
        c.rampType === "withdraw" &&
        String(c.channelType || "").toLowerCase() === "bank",
    )
    if (!recv || !send) {
      console.warn("Expected NG receive or KE send preflight channel was not found.")
    }

    const postResults: TimedResult[] = []
    postResults.push(
      await bench("receive (dummy)", "POST", "/receive", () =>
        yellowcardFetch({
          method: "POST",
          path: "/receive",
          json: {
            sequenceId: `yc_probe_${randomUUID()}`,
            customerUID: "00000000-0000-0000-0000-000000000000",
            channelType: "bank",
            currency: "NGN",
            country: "NG",
            localAmount: 5000,
            forceAccept: true,
            directSettlement: true,
            settlementInfo: {
              walletAddress: "11111111111111111111111111111111",
              cryptoCurrency: "USDC",
              cryptoNetwork: "SOL",
            },
            recipient: {
              name: "Probe",
              country: "NG",
              phone: "+2348000000000",
              address: "x",
              dob: "1990-01-01",
              email: "p@e.com",
              idNumber: "1",
              idType: "national_id",
            },
            source: { accountType: "bank" },
            reason: "fund_balance",
          },
        }),
      ),
    )
    postResults.push(
      await bench("send (dummy)", "POST", "/send", () =>
        yellowcardFetch({
          method: "POST",
          path: "/send",
          json: {
            sequenceId: `yc_probe_${randomUUID()}`,
            customerUID: "00000000-0000-0000-0000-000000000000",
            channelType: "bank",
            currency: "KES",
            country: "KE",
            localAmount: 1000,
            forceAccept: true,
            directSettlement: true,
            settlementInfo: {
              cryptoCurrency: "USDC",
              cryptoNetwork: "SOL",
              cryptoAmount: 10,
              refundAddress: "11111111111111111111111111111111",
            },
            destination: {
              accountNumber: "000",
              accountName: "Probe",
              accountType: "bank",
              networkId: "00000000-0000-0000-0000-000000000000",
            },
            reason: "other",
          },
        }),
      ),
    )
    for (const r of postResults) printResult(r)
    results.push(...postResults)

    const all = results
    const slow = all.filter((r) => stats(r.runs).p50 >= 3000)
    console.log("")
    if (slow.length) {
      console.log("⚠ Endpoints with p50 >= 3s:")
      for (const r of slow) printResult(r)
    } else {
      console.log("✓ All probed endpoints p50 < 3s (vs ~8-10s sandbox issue earlier)")
    }
    console.log("\nFor real quote timing, rerun with YC_PROBE_LIVE_QUOTES=1 YC_PROBE_CUSTOMER_UID=<kycUserId>")
    return
  }

  if (!CUSTOMER_UID) {
    console.error("\nYC_PROBE_CUSTOMER_UID required for live quote probes.")
    process.exit(1)
  }

  const channels = await listYellowcardChannels()
  const receiveChannel = findYcReceiveChannel(channels, {
    country: "NG",
    currency: "NGN",
    rail: "bank_transfer",
  })
  const sendChannel = await findYcSendChannel({
    countryCode: "KE",
    currencyCode: "KES",
    rail: "bank_transfer",
  })
  const receiveChannelId = String(receiveChannel?.id ?? receiveChannel?.channelId ?? "")
  const sendChannelId = String(sendChannel?.id ?? sendChannel?.channelId ?? "")

  if (!receiveChannelId || !sendChannelId) {
    console.error("Could not resolve NG receive or KE send channel for live probes.")
    process.exit(1)
  }

  const postResults: TimedResult[] = []

  postResults.push(
    await bench("receive quote NG bank", "POST", "/receive", () =>
      yellowcardFetch({
        method: "POST",
        path: "/receive",
        json: {
          sequenceId: `yc_probe_${randomUUID()}`,
          customerUID: CUSTOMER_UID,
          customerType: "retail",
          channelType: "bank",
          currency: "NGN",
          country: "NG",
          localAmount: 5000,
          forceAccept: true,
          directSettlement: true,
          settlementInfo: {
            walletAddress: process.env.DEPOSIT_OMNIBUS_SOLANA_ADDRESS_USD,
            cryptoCurrency: "USDC",
            cryptoNetwork: "SOL",
          },
          recipient: {
            name: "Probe User",
            country: "NG",
            phone: "+2348000000000",
            address: "Probe",
            dob: "1990-01-01",
            email: "probe@easner.com",
            idNumber: "00000000000",
            idType: "national_id",
          },
          source: { accountType: "bank" },
          reason: "fund_balance",
        },
      }),
    ),
  )

  postResults.push(
    await bench("send quote KE bank", "POST", "/send", () =>
      yellowcardFetch({
        method: "POST",
        path: "/send",
        json: {
          sequenceId: `yc_probe_${randomUUID()}`,
          customerUID: CUSTOMER_UID,
          customerType: "retail",
          channelType: "bank",
          currency: "KES",
          country: "KE",
          localAmount: 1000,
          forceAccept: true,
          directSettlement: true,
          settlementInfo: {
            cryptoCurrency: "USDC",
            cryptoNetwork: "SOL",
            cryptoAmount: 10,
            refundAddress: process.env.DEPOSIT_OMNIBUS_SOLANA_ADDRESS_USD,
          },
          destination: {
            accountNumber: "0000000000",
            accountName: "Probe Recipient",
            accountType: "bank",
            networkId: "00000000-0000-0000-0000-000000000000",
          },
          reason: "other",
        },
      }),
    ),
  )

  console.log("\n--- POST endpoints (live quotes) ---")
  for (const r of postResults) printResult(r)

  const all = [...results, ...postResults]
  const slow = all.filter((r) => stats(r.runs).p50 >= 3000)
  if (slow.length) {
    console.log("\n⚠ Endpoints with p50 >= 3s (sandbox-like slowness):")
    for (const r of slow) printResult(r)
  } else {
    console.log("\n✓ All probed endpoints p50 < 3s")
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

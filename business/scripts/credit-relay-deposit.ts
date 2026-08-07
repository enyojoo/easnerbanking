#!/usr/bin/env node
/**
 * Credit a relay Tron deposit row that is stuck in awaiting_turnkey.
 *
 *   cd business && node --env-file=.env.local --import tsx scripts/credit-relay-deposit.ts --deposit-id=<uuid>
 *   cd business && node --env-file=.env.local --import tsx scripts/credit-relay-deposit.ts --relay-request-id=0x...
 */
import { createSupabaseAdmin } from "../lib/supabase/admin"
import {
  reconcilePendingRelayDeposits,
  tryCreditRelayTronDeposit,
} from "../lib/relay-deposit/settle-relay-deposit"

function readArg(name: string): string | null {
  const prefix = `--${name}=`
  const hit = process.argv.find((arg) => arg.startsWith(prefix))
  return hit ? hit.slice(prefix.length).trim() : null
}

async function main() {
  const depositId = readArg("deposit-id")
  const relayRequestId = readArg("relay-request-id")
  const reconcileAll = process.argv.includes("--reconcile-pending")

  const admin = createSupabaseAdmin()

  if (reconcileAll) {
    const result = await reconcilePendingRelayDeposits(admin, { limit: 200 })
    console.log("[credit-relay-deposit] reconcilePendingRelayDeposits", result)
    return
  }

  if (!depositId && !relayRequestId) {
    throw new Error("Pass --deposit-id=<uuid> or --relay-request-id=<id> or --reconcile-pending")
  }

  let resolvedId = depositId
  if (!resolvedId && relayRequestId) {
    const { data } = await admin
      .from("relay_deposits")
      .select("id")
      .eq("relay_request_id", relayRequestId)
      .maybeSingle()
    resolvedId = data?.id ? String(data.id) : null
  }

  if (!resolvedId) throw new Error("relay_deposit_not_found")

  const result = await tryCreditRelayTronDeposit(admin, resolvedId)
  console.log("[credit-relay-deposit]", { depositId: resolvedId, ...result })
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})

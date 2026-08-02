/**
 * How does the YC fee scale on non-directSettlement sends (exact localAmount lock)?
 *
 * directSettlement on 2000 NGN charges serviceFeeAmountLocal 20.17 (~1%), while
 * directSettlement:false with localAmount 2000 charged 100. This probe checks whether
 * 100 is a flat floor or a different percentage, which decides whether an exact-local
 * (prefunded fiat wallet) payout path is economically viable.
 *
 * Safety: forceAccept=false — sends stay pending_approval and expire in ~10 minutes.
 *
 * Usage:
 *   cd business && node --env-file=.env.local --import tsx \
 *     scripts/probe-yc-send-nondirect-fee-scale.ts
 */
import { randomUUID } from "crypto"
import { createSupabaseAdmin } from "../lib/supabase/admin"
import { yellowcardFetch } from "../lib/yellowcard/http"
import { getYellowcardEnvironment } from "../lib/yellowcard/config"
import { buildYcKycPersonMetadata } from "../lib/yellowcard/kyc-metadata"
import { mapRecipientToYcSend } from "../lib/yellowcard/map-recipient-to-yc-send"
import { resolveYcSendChannelId } from "../lib/payout-providers/yellowcard-provider"
import { resolveRecipientPayoutCountry } from "../lib/terminal/recipient-sell-prepare"
import type { RecipientSellPrepareRow } from "../lib/terminal/recipient-sell-prepare"
import { resolveYcPaymentReason } from "@easner/shared"

const USER_ID = String(
  process.env.YC_PROBE_USER_ID || "c7ace38e-be38-43e7-86e1-6e66b90d4243",
).trim()
const LOCAL_AMOUNTS = String(process.env.YC_PROBE_LOCAL_AMOUNTS || "2000,2105.26,5000,20000,100000")
  .split(",")
  .map((s) => Number(s.trim()))
  .filter((n) => Number.isFinite(n) && n > 0)

async function main() {
  console.log("=== YC non-directSettlement fee scaling ===")
  console.log("environment:", getYellowcardEnvironment())
  console.log("forceAccept: false (pending approval only)\n")

  const admin = createSupabaseAdmin()
  const { data: userRow } = await admin.from("users").select("*").eq("id", USER_ID).maybeSingle()
  if (!userRow) throw new Error(`User ${USER_ID} not found`)
  const { data: recipients } = await admin
    .from("recipients")
    .select("*")
    .eq("user_id", USER_ID)
    .order("created_at", { ascending: false })
    .limit(30)
  const recipient = (recipients ?? []).find(
    (r) => String(r.currency).toUpperCase() === "NGN",
  ) as RecipientSellPrepareRow | undefined
  if (!recipient) throw new Error("No NGN recipient for probe user")

  const country = resolveRecipientPayoutCountry(recipient) ?? "NG"
  const channelId = await resolveYcSendChannelId({
    countryCode: country,
    currencyCode: "NGN",
    rail: "bank_transfer",
  })
  if (!channelId) throw new Error("No NGN send channel")

  const sender = buildYcKycPersonMetadata({
    profile: {
      residenceCountry: userRow.residence_country,
      kycIdType: userRow.kyc_id_type,
      kycIdNumber: userRow.kyc_id_number,
      ngLocalIdType: userRow.ng_local_id_type,
      ngLocalIdNumber: userRow.ng_local_id_number,
      fullName: userRow.full_name,
      phone: userRow.phone,
      email: userRow.email,
      dateOfBirth: userRow.date_of_birth,
      addressStreet: userRow.kyc_address_street,
      addressCity: userRow.kyc_address_city,
      addressCountry: userRow.kyc_address_country,
    },
    requireNgIds: true,
  })
  const mapped = await mapRecipientToYcSend(recipient, { channelId })

  console.log(
    "localAmount".padStart(12),
    "amountUSD".padStart(10),
    "converted".padStart(11),
    "feeLocal".padStart(9),
    "feeUSD".padStart(8),
    "fee%".padStart(7),
    "  id",
  )

  for (const localAmount of LOCAL_AMOUNTS) {
    const body = {
      sequenceId: `yc_probe_feescale_${randomUUID()}`,
      customerUID: USER_ID,
      customerType: "retail" as const,
      channelId,
      currency: "NGN",
      country,
      forceAccept: false,
      directSettlement: false,
      localAmount,
      sender,
      destination: mapped.destination,
      ...mapped.root,
      reason: resolveYcPaymentReason("probe_fee_scale"),
    }
    try {
      const res = await yellowcardFetch<Record<string, unknown>>({
        method: "POST",
        path: "/send",
        json: body,
      })
      const full = await yellowcardFetch<Record<string, unknown>>({
        method: "GET",
        path: `/send/${String(res.id)}`,
      })
      const converted = Number(full.convertedAmount ?? 0)
      const feeLocal = Number(full.serviceFeeAmountLocal ?? 0)
      console.log(
        String(localAmount).padStart(12),
        String(full.amount ?? "").padStart(10),
        String(converted).padStart(11),
        String(feeLocal).padStart(9),
        String(full.serviceFeeAmountUSD ?? "").padStart(8),
        `${converted > 0 ? ((feeLocal / converted) * 100).toFixed(2) : "?"}%`.padStart(7),
        ` ${String(full.id)}`,
      )
    } catch (e) {
      const err = e as { status?: number; message?: string }
      console.log(String(localAmount).padStart(12), " FAIL", err.status, err.message)
    }
  }

  console.log("\nInterpretation:")
  console.log("- Flat 100 NGN across sizes => fixed floor; cheap at large amounts, dear at 2000.")
  console.log("- Scaling with size => a different percentage than directSettlement's ~1%.")
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})

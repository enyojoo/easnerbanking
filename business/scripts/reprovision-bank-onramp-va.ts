/**
 * Force re-bind Noah bank on-ramp VAs to the current destination (omnibus or user vault).
 * Works for customers who already have VAs – does not require new KYC.
 *
 * Usage:
 *   cd business
 *   npx tsx scripts/reprovision-bank-onramp-va.ts --business-id <uuid>
 *   npx tsx scripts/reprovision-bank-onramp-va.ts --user-id <uuid>
 *   npx tsx scripts/reprovision-bank-onramp-va.ts --noah-customer-id ebiz_...
 *   npx tsx scripts/reprovision-bank-onramp-va.ts --business-id <uuid> --rails usd
 *   npx tsx scripts/reprovision-bank-onramp-va.ts --business-id <uuid> --dry-run
 *
 * Requires: Noah API env, Supabase service role, Turnkey addresses if omnibus flags on.
 */

import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { reprovisionBankOnrampVirtualAccounts } from "@/lib/noah/bank-onramp-virtual-accounts"
import { resolveReprovisionSubject } from "@/lib/noah/resolve-reprovision-subject"
import { businessUsesGridVerification } from "@/lib/compliance/business-tier1"
import {
  isDepositOmnibusEnabled,
  depositOmnibusAllowlistCustomerIds,
} from "@/lib/deposit-omnibus/config"

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name)
  return i >= 0 ? process.argv[i + 1] : undefined
}

function parseRails(raw: string | undefined): Array<"usd" | "eur"> | undefined {
  if (!raw) return undefined
  const v = raw.toLowerCase()
  if (v === "both" || v === "all") return ["usd", "eur"]
  if (v === "usd" || v === "eur") return [v]
  throw new Error("--rails must be usd, eur, or both")
}

async function main() {
  const dryRun = process.argv.includes("--dry-run")
  const businessId = arg("--business-id")
  const userId = arg("--user-id")
  const noahCustomerId = arg("--noah-customer-id")
  const rails = parseRails(arg("--rails"))

  const admin = createSupabaseAdmin()
  const subject = await resolveReprovisionSubject(admin, { businessId, userId, noahCustomerId })
  if ("error" in subject) {
    throw new Error(subject.error)
  }

  if (subject.scope === "business" && subject.subjectBusinessId) {
    const { data: biz } = await admin
      .from("businesses")
      .select("verification_provider")
      .eq("id", subject.subjectBusinessId)
      .maybeSingle()
    if (businessUsesGridVerification(biz as { verification_provider?: string | null } | null)) {
      console.error(
        "Grid-verified business – use Grid sync / refreshGridBusinessReceiveRails instead of Noah on-ramp.",
      )
      process.exit(1)
    }
  }

  console.log("Subject:", subject)
  console.log("Omnibus enabled:", isDepositOmnibusEnabled())
  console.log("Allowlist:", depositOmnibusAllowlistCustomerIds().join(",") || "(all when omnibus on)")

  const results = await reprovisionBankOnrampVirtualAccounts(admin, {
    ...subject,
    rails,
    dryRun,
  })

  console.log("\nResults:")
  for (const r of results) {
    console.log(JSON.stringify(r, null, 2))
  }

  const failed = results.filter((r) => !r.ok)
  if (failed.length) process.exit(1)
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})

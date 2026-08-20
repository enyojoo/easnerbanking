/**
 * Create USDC/EURC ATAs for deposit omnibus Solana owner addresses (parent org).
 *
 * Usage (from repo root or business/):
 *   cd business
 *   TURNKEY_ORGANIZATION_ID=... \
 *   TURNKEY_API_PUBLIC_KEY=... \
 *   TURNKEY_API_PRIVATE_KEY=... \
 *   DEPOSIT_OMNIBUS_SOLANA_ADDRESS_USD=4RQ7... \
 *   DEPOSIT_OMNIBUS_SOLANA_ADDRESS_EUR=2m5C... \
 *   npx tsx scripts/setup-deposit-omnibus-atas.ts
 *
 * Dry-run (print derived ATAs only, no on-chain tx):
 *   ... npx tsx scripts/setup-deposit-omnibus-atas.ts --dry-run
 *
 * Index check: USD address must be derivation path m/44'/501'/0'/0' (index 0).
 * EUR address must be m/44'/501'/1'/0' (index 1). Confirm in Turnkey → wallet → Parameters (i).
 */

import { deriveStablecoinAssociatedTokenAddress } from "@/lib/solana/ata"
import { getTurnkeyOrganizationId, isTurnkeyConfigured } from "@/lib/turnkey/config"

const dryRun = process.argv.includes("--dry-run")

function requireEnv(name: string): string {
  const v = String(process.env[name] || "").trim()
  if (!v) throw new Error(`Missing env: ${name}`)
  return v
}

async function ensureOne(label: string, vaultAddress: string, asset: "USDC" | "EURC", orgId: string) {
  const ata = deriveStablecoinAssociatedTokenAddress(vaultAddress, asset)
  console.log(`\n[${label}] owner=${vaultAddress}`)
  console.log(`[${label}] expected ATA (${asset})=${ata ?? "derivation failed"}`)

  if (dryRun) return

  const { ensureStablecoinTokenAccountOnChain } = await import(
    "@/lib/turnkey/ensure-spl-token-account"
  )

  const result = await ensureStablecoinTokenAccountOnChain({
    subOrgId: orgId,
    vaultAddress,
    asset,
    expectedAta: ata,
  })

  if (!result.ok) {
    console.error(`[${label}] FAILED: ${result.error}`)
    process.exitCode = 1
    return
  }

  console.log(`[${label}] OK ata=${result.ata} created=${result.created}`)
}

async function main() {
  const usdOwner = requireEnv("DEPOSIT_OMNIBUS_SOLANA_ADDRESS_USD")
  const eurOwner = requireEnv("DEPOSIT_OMNIBUS_SOLANA_ADDRESS_EUR")

  if (!dryRun && !isTurnkeyConfigured()) {
    throw new Error("Turnkey not configured (TURNKEY_ORGANIZATION_ID + API keys)")
  }

  const orgId = getTurnkeyOrganizationId()
  if (!orgId && !dryRun) throw new Error("TURNKEY_ORGANIZATION_ID missing")

  console.log(dryRun ? "DRY RUN – derived ATAs only" : `Parent org: ${orgId}`)

  await ensureOne("USD/USDC", usdOwner, "USDC", orgId)
  await ensureOne("EUR/EURC", eurOwner, "EURC", orgId)

  if (!dryRun && process.exitCode !== 1) {
    console.log("\nDone. Verify on Solscan: each owner should have a USDC or EURC token account.")
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})

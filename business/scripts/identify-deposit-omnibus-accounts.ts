/**
 * List Solana accounts on the deposit omnibus wallet with derivation paths
 * so you can map DEPOSIT_OMNIBUS_SOLANA_ADDRESS_USD vs _EUR.
 *
 * Usage:
 *   cd business
 *   TURNKEY_ORGANIZATION_ID=... TURNKEY_API_PUBLIC_KEY=... TURNKEY_API_PRIVATE_KEY=... \
 *   npx tsx scripts/identify-deposit-omnibus-accounts.ts --wallet-id fe78...51ff
 *
 * Or pass two addresses to classify by table order hint:
 *   npx tsx scripts/identify-deposit-omnibus-accounts.ts \
 *     --address 4RQ7... --address 2m5C...
 */

import { getTurnkeyApiClient } from "@/lib/turnkey/client"
import { getTurnkeyOrganizationId, isTurnkeyConfigured } from "@/lib/turnkey/config"

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name)
  return i >= 0 ? process.argv[i + 1] : undefined
}

function addressesFromArgs(): string[] {
  const out: string[] = []
  for (let i = 0; i < process.argv.length; i++) {
    if (process.argv[i] === "--address" && process.argv[i + 1]) {
      out.push(process.argv[i + 1]!.trim())
    }
  }
  return out
}

/** Parse Solana BIP32 path index from Turnkey path, e.g. m/44'/501'/1'/0' → 1 */
export function solanaAccountIndexFromPath(path: string): number | null {
  const p = String(path || "").trim()
  const m = p.match(/44'\/501'\/(\d+)'\/0'/i)
  if (!m) return null
  const n = Number(m[1])
  return Number.isFinite(n) ? n : null
}

function envVarForIndex(index: number | null): string {
  if (index === 0) return "DEPOSIT_OMNIBUS_SOLANA_ADDRESS_USD  (USDC / USD ledger)"
  if (index === 1) return "DEPOSIT_OMNIBUS_SOLANA_ADDRESS_EUR  (EURC / EUR ledger)"
  return "unknown index — expected 0 (USD) or 1 (EUR)"
}

type WalletAccountRow = {
  address: string
  path: string
  index: number | null
}

async function fetchWalletAccounts(walletId: string): Promise<WalletAccountRow[]> {
  if (!isTurnkeyConfigured()) {
    throw new Error("Turnkey not configured (TURNKEY_ORGANIZATION_ID + API keys)")
  }
  const orgId = getTurnkeyOrganizationId()
  const client = getTurnkeyApiClient() as Record<string, (...args: unknown[]) => Promise<unknown>> | null
  if (!client) throw new Error("Turnkey client unavailable")

  const getWallet = client.getWallet ?? client.getWallets
  if (!getWallet) {
    throw new Error("Turnkey SDK has no getWallet — use --address flags and table order instead")
  }

  const res = (await getWallet.call(client, {
    organizationId: orgId,
    walletId,
  })) as Record<string, unknown>

  const wallet = (res.wallet ?? res) as Record<string, unknown>
  const accounts = (wallet.accounts ?? res.accounts ?? []) as Array<Record<string, unknown>>

  return accounts
    .map((a) => {
      const address = String(a.address ?? a.Address ?? "").trim()
      const path = String(a.path ?? a.Path ?? a.derivationPath ?? "").trim()
      const curve = String(a.curve ?? a.Curve ?? "").toLowerCase()
      if (curve && curve !== "curve_ed25519" && curve !== "ed25519") return null
      if (!address) return null
      return { address, path, index: solanaAccountIndexFromPath(path) }
    })
    .filter((r): r is WalletAccountRow => r != null)
}

function printMapping(rows: WalletAccountRow[]) {
  console.log("\n=== Deposit omnibus address mapping ===\n")
  for (const row of rows) {
    const asset = row.index === 0 ? "USDC" : row.index === 1 ? "EURC" : "?"
    console.log(`Address:  ${row.address}`)
    console.log(`Path:     ${row.path || "(not returned by API)"}`)
    console.log(`Index:    ${row.index ?? "?"}`)
    console.log(`Asset:    ${asset}`)
    console.log(`Env var:  ${envVarForIndex(row.index)}`)
    console.log("")
  }

  const usd = rows.find((r) => r.index === 0)
  const eur = rows.find((r) => r.index === 1)
  if (usd && eur) {
    console.log("--- Copy into env ---")
    console.log(`DEPOSIT_OMNIBUS_SOLANA_ADDRESS_USD=${usd.address}`)
    console.log(`DEPOSIT_OMNIBUS_SOLANA_ADDRESS_EUR=${eur.address}`)
  }
}

async function main() {
  const walletId = arg("--wallet-id")
  const manualAddresses = addressesFromArgs()

  if (walletId) {
    const rows = await fetchWalletAccounts(walletId)
    if (!rows.length) {
      console.error("No Solana accounts found on wallet", walletId)
      process.exit(1)
    }
    printMapping(rows)
    return
  }

  if (manualAddresses.length === 2) {
    console.log(
      "No --wallet-id: assuming first --address is index 0 (USD), second is index 1 (EUR).",
    )
    console.log("Confirm in Turnkey: path must be .../501'/0'/0' vs .../501'/1'/0'.\n")
    printMapping([
      { address: manualAddresses[0]!, path: "m/44'/501'/0'/0' (assumed)", index: 0 },
      { address: manualAddresses[1]!, path: "m/44'/501'/1'/0' (assumed)", index: 1 },
    ])
    return
  }

  console.log(`Usage:
  npx tsx scripts/identify-deposit-omnibus-accounts.ts --wallet-id <id>
  npx tsx scripts/identify-deposit-omnibus-accounts.ts --address <pubkey> --address <pubkey>

Turnkey UI truncates paths to m/44'....'/0' — the digit that matters is hidden:
  m/44'/501'/0'/0'  → USD / USDC  (DEPOSIT_OMNIBUS_SOLANA_ADDRESS_USD)
  m/44'/501'/1'/0'  → EUR / EURC  (DEPOSIT_OMNIBUS_SOLANA_ADDRESS_EUR)

If you created accounts in that order, row 1 in the wallet table is USD, row 2 is EUR.`)
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})

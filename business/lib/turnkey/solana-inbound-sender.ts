import type { Connection } from "@solana/web3.js"
import {
  accountPubkeyAtIndex,
  type ParsedTx,
  resolvedAccountKeys,
} from "@/lib/turnkey/solana-parsed-tx-accounts"

function parseAtomic(raw: string | undefined): bigint {
  if (!raw || !/^-?\d+$/.test(raw)) return BigInt(0)
  try {
    return BigInt(raw)
  } catch {
    return BigInt(0)
  }
}

/**
 * Find SPL balance change for vault owner or ATA (handles v0 txs and missing `owner` on token rows).
 */
export function tokenBalanceDeltaForVault(
  tx: ParsedTx,
  mint: string,
  ownerLower: string,
  ataLower: string | null,
): { delta: bigint; decimals: number } | null {
  const pre = tx.meta?.preTokenBalances || []
  const post = tx.meta?.postTokenBalances || []
  const indices = new Set<number>()
  for (const row of [...pre, ...post]) {
    if (row.mint === mint) indices.add(row.accountIndex)
  }

  for (const accountIndex of indices) {
    const preRow = pre.find((r) => r.accountIndex === accountIndex && r.mint === mint)
    const postRow = post.find((r) => r.accountIndex === accountIndex && r.mint === mint)
    const owner = String(postRow?.owner ?? preRow?.owner ?? "").toLowerCase()
    const acct = accountPubkeyAtIndex(tx, accountIndex)?.toLowerCase() ?? ""

    const matchesVault =
      owner === ownerLower || (ataLower && (acct === ataLower || owner === ataLower))
    if (!matchesVault) continue

    const preAmt = parseAtomic(preRow?.uiTokenAmount?.amount)
    const postAmt = parseAtomic(postRow?.uiTokenAmount?.amount)
    const decimals = Number(postRow?.uiTokenAmount?.decimals ?? preRow?.uiTokenAmount?.decimals ?? 6)
    const delta = postAmt - preAmt
    if (delta !== BigInt(0)) return { delta, decimals }
  }

  for (const row of post) {
    if (row.mint !== mint) continue
    if ((row.owner || "").toLowerCase() !== ownerLower) continue
    const preRow = pre.find((r) => r.accountIndex === row.accountIndex && r.mint === mint)
    const preAmt = parseAtomic(preRow?.uiTokenAmount?.amount)
    const postAmt = parseAtomic(row.uiTokenAmount?.amount)
    const decimals = Number(row.uiTokenAmount?.decimals ?? 6)
    const delta = postAmt - preAmt
    if (delta !== BigInt(0)) return { delta, decimals }
  }

  void resolvedAccountKeys
  return null
}

/**
 * Best-effort sender wallet for an inbound SPL transfer to a user vault ATA.
 * Uses token balance deltas on the mint – Turnkey balance webhooks omit `fromAddress`.
 */
export function resolveSplTransferSenderForVaultInbound(
  tx: ParsedTx,
  mint: string,
  ownerLower: string,
  ataLower: string | null,
): string | null {
  const vaultDelta = tokenBalanceDeltaForVault(tx, mint, ownerLower, ataLower)
  if (!vaultDelta || vaultDelta.delta <= BigInt(0)) return null

  const pre = tx.meta?.preTokenBalances || []
  const post = tx.meta?.postTokenBalances || []
  const indices = new Set<number>()
  for (const row of [...pre, ...post]) {
    if (row.mint === mint) indices.add(row.accountIndex)
  }

  let bestOwner: string | null = null
  let bestSent = BigInt(0)

  for (const accountIndex of indices) {
    const preRow = pre.find((r) => r.accountIndex === accountIndex && r.mint === mint)
    const postRow = post.find((r) => r.accountIndex === accountIndex && r.mint === mint)
    const owner = String(postRow?.owner ?? preRow?.owner ?? "").trim()
    const acct = accountPubkeyAtIndex(tx, accountIndex)?.toLowerCase() ?? ""
    const ownerL = owner.toLowerCase()

    const matchesVault =
      ownerL === ownerLower || (ataLower && (acct === ataLower || ownerL === ataLower))
    if (matchesVault) continue

    const preAmt = parseAtomic(preRow?.uiTokenAmount?.amount)
    const postAmt = parseAtomic(postRow?.uiTokenAmount?.amount)
    const delta = postAmt - preAmt
    if (delta >= BigInt(0)) continue

    const sent = -delta
    if (sent > bestSent) {
      bestSent = sent
      bestOwner = owner
    }
  }

  return bestOwner
}

export async function resolveSolanaInboundSenderFromTxHash(
  connection: Connection,
  input: {
    txHash: string
    mint: string
    ownerAddress: string
    tokenAccountAddress?: string | null
  },
): Promise<string | null> {
  const txHash = String(input.txHash || "").trim()
  if (!txHash) return null

  let tx: ParsedTx | null = null
  try {
    tx = await connection.getParsedTransaction(txHash, {
      maxSupportedTransactionVersion: 0,
    })
  } catch {
    return null
  }
  if (!tx?.meta) return null

  return resolveSplTransferSenderForVaultInbound(
    tx,
    input.mint,
    String(input.ownerAddress || "").trim().toLowerCase(),
    String(input.tokenAccountAddress || "").trim().toLowerCase() || null,
  )
}

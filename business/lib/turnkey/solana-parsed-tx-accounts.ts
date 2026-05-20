import type { Connection } from "@solana/web3.js"

export type ParsedTx = NonNullable<Awaited<ReturnType<Connection["getParsedTransaction"]>>>

function pubkeyBase58(key: unknown): string | null {
  if (!key) return null
  if (typeof key === "string") return key
  if (typeof key === "object" && key !== null && "pubkey" in key) {
    const pk = (key as { pubkey?: { toBase58?: () => string; toString?: () => string } }).pubkey
    if (pk?.toBase58) return pk.toBase58()
    if (pk?.toString) return pk.toString()
  }
  if (typeof (key as { toBase58?: () => string }).toBase58 === "function") {
    return (key as { toBase58: () => string }).toBase58()
  }
  return null
}

/** Resolved account keys for legacy and versioned (v0) transactions. */
export function resolvedAccountKeys(tx: ParsedTx): string[] {
  const msg = tx.transaction?.message
  if (!msg) return []

  if ("accountKeys" in msg && Array.isArray((msg as { accountKeys?: unknown[] }).accountKeys)) {
    const keys = (msg as { accountKeys: unknown[] }).accountKeys
    return keys.map(pubkeyBase58).filter((k): k is string => Boolean(k))
  }

  if ("staticAccountKeys" in msg && Array.isArray((msg as { staticAccountKeys?: unknown[] }).staticAccountKeys)) {
    const staticKeys = (msg as { staticAccountKeys: unknown[] }).staticAccountKeys
      .map(pubkeyBase58)
      .filter((k): k is string => Boolean(k))
    const loaded = tx.meta?.loadedAddresses as
      | { writable?: unknown[]; readonly?: unknown[] }
      | undefined
    const writable = (loaded?.writable ?? []).map(pubkeyBase58).filter((k): k is string => Boolean(k))
    const readonly = (loaded?.readonly ?? []).map(pubkeyBase58).filter((k): k is string => Boolean(k))
    return [...staticKeys, ...writable, ...readonly]
  }

  return []
}

export function accountPubkeyAtIndex(tx: ParsedTx, accountIndex: number): string | null {
  const keys = resolvedAccountKeys(tx)
  return keys[accountIndex] ?? null
}

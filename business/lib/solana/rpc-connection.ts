import { Connection } from "@solana/web3.js"

export function getSolanaRpcUrl(): string {
  const explicit = (process.env.SOLANA_RPC_URL || "").trim()
  if (explicit) return explicit
  return "https://api.mainnet-beta.solana.com"
}

/** Shared RPC client – no built-in 429 retry storm (web3.js defaults retry up to 4s backoff). */
export function createSolanaRpcConnection(): Connection {
  return new Connection(getSolanaRpcUrl(), {
    commitment: "confirmed",
    disableRetryOnRateLimit: true,
  })
}

export function isSolanaRpcRateLimitedError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e)
  return /429|too many requests|rate limit/i.test(msg)
}

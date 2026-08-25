import { createSolanaRpcConnection } from "@/lib/solana/rpc-connection"
import { mintForStablecoinAsset } from "@/lib/solana/spl-mints"

const ATA = "Ab3dnaEu6yxvxVLtFw1c9KBYSLddr3MPVobo48WUpdWa"
const OWNER = "4iLSnF9Joo2bj5fYSWBAqXx15nLxrQtoLWiL1fnUD4wY"
const MINT = mintForStablecoinAsset("USDC")!

async function inspect(hash: string, label: string) {
  const conn = createSolanaRpcConnection()
  const tx = await conn.getParsedTransaction(hash, { maxSupportedTransactionVersion: 0 })
  if (!tx?.meta) {
    console.log(JSON.stringify({ label, hash, error: "not found" }))
    return
  }
  const pre = tx.meta.preTokenBalances ?? []
  const post = tx.meta.postTokenBalances ?? []
  const rows = post.map((p) => {
    const before = pre.find((x) => x.accountIndex === p.accountIndex)
    const preAmt = Number(before?.uiTokenAmount?.uiAmountString ?? before?.uiTokenAmount?.amount ?? 0)
    const postAmt = Number(p.uiTokenAmount?.uiAmountString ?? p.uiTokenAmount?.amount ?? 0)
    return {
      owner: p.owner,
      mint: p.mint,
      accountIndex: p.accountIndex,
      pre: before?.uiTokenAmount,
      post: p.uiTokenAmount,
      deltaUi: postAmt - preAmt,
    }
  })
  const ataRow = rows.find((r) => r.owner === OWNER || String(r.post?.amount ?? "").includes(""))
  console.log(JSON.stringify({ label, hash, rows }, null, 2))
}

async function main() {
  await inspect(
    "3bZnChsHBXX3g2RREzJvT9cS7yDE5N7gXAWk23rSLBQaqTLhD5qBpxaHiWhH6PN1wzi5kfaww3KLSvXG6FoqDTtp",
    "$1 sweep",
  )
  await inspect(
    "5tGazsFACAKg4gcNVfygDhbbpneFouwPzEqA3DTzuhFFNLEGn97GeZipyq33nSz44wUhUZmBu8C4Qzd3Kf6NFgZn",
    "$4500 sweep",
  )
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

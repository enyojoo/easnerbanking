import { Connection, PublicKey } from "@solana/web3.js"
import { getSolanaRpcUrl } from "../lib/turnkey/sol-spl-transfer-unsigned-tx"
import { mintForStablecoinAsset } from "../lib/solana/spl-mints"

async function main() {
  const omnibus = process.env.DEPOSIT_OMNIBUS_SOLANA_ADDRESS_USD
  if (!omnibus) throw new Error("DEPOSIT_OMNIBUS_SOLANA_ADDRESS_USD missing")

  const connection = new Connection(getSolanaRpcUrl(), "confirmed")
  const mint = mintForStablecoinAsset("USDC")
  if (!mint) throw new Error("usdc mint missing")

  const accounts = await connection.getParsedTokenAccountsByOwner(new PublicKey(omnibus), {
    mint: new PublicKey(mint),
  })

  console.log("omnibus", omnibus)
  if (!accounts.value.length) {
    console.log("USDC balance: 0 (no token account)")
    return
  }

  for (const { pubkey, account } of accounts.value) {
    const info = account.data.parsed.info
    console.log("token_account", pubkey.toBase58())
    console.log("USDC balance", info.tokenAmount.uiAmountString)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

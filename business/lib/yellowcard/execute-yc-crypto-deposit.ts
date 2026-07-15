import { sendStablecoinFromDepositOmnibus } from "@/lib/turnkey/send-from-omnibus"

/**
 * After YC POST /send, deposit USDC from omnibus to YC settlementInfo.walletAddress (G1).
 */
export async function executeYcCryptoDeposit(input: {
  ycWalletAddress: string
  cryptoAmountUsd: number
  pollForSettlement?: boolean
}): Promise<{
  status: "pending" | "settled" | "failed" | "skipped"
  txHash: string | null
  providerTransactionId: string | null
  errorMessage: string | null
  dryRun: boolean
}> {
  const destinationAddress = String(input.ycWalletAddress || "").trim()
  const amount = Number(input.cryptoAmountUsd)
  if (!destinationAddress || !Number.isFinite(amount) || amount <= 0) {
    return {
      status: "failed",
      txHash: null,
      providerTransactionId: null,
      errorMessage: "invalid_yc_crypto_deposit_input",
      dryRun: false,
    }
  }

  const result = await sendStablecoinFromDepositOmnibus({
    ledgerCurrency: "USD",
    asset: "USDC",
    destinationAddress,
    amount,
    pollForSettlement: input.pollForSettlement ?? true,
  })

  return {
    status: result.status,
    txHash: result.txHash,
    providerTransactionId: result.providerTransactionId,
    errorMessage: result.errorMessage,
    dryRun: result.dryRun,
  }
}

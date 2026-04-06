/**
 * Merchant-facing deposit options for Stablecoin Terminal (must match Noah automated payout matrix).
 */
export type TerminalAllowedPair = {
  cryptoCurrency: string
  network: string
  label: string
}

export const TERMINAL_ALLOWED_PAIRS: TerminalAllowedPair[] = [
  {
    cryptoCurrency: "USDC_TEST",
    network: "EthereumTestSepolia",
    label: "USDC (Sepolia testnet)",
  },
  {
    cryptoCurrency: "USDC",
    network: "Ethereum",
    label: "USDC (Ethereum)",
  },
]

export function isAllowedTerminalPair(
  cryptoCurrency: string,
  network: string,
): TerminalAllowedPair | undefined {
  const c = cryptoCurrency.trim()
  const n = network.trim()
  return TERMINAL_ALLOWED_PAIRS.find(
    (p) => p.cryptoCurrency === c && p.network === n,
  )
}

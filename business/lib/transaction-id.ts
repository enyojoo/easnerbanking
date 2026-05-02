/**
 * Generate Transaction ID
 * Display format: uppercase `ETID` + **8 decimal digits** (aligned with SQL `transfer_easetag_p2p` and URL normalization).
 * Example: ETID27382930
 */
export function generateTransactionId(): string {
  const timestamp = Date.now().toString()
  const last8Digits = timestamp.slice(-8)
  return `ETID${last8Digits}`
}

/** Parse a raw QR payload into a wallet address (strips URI scheme/query). */
export function extractWalletAddress(value: string): string {
  const raw = String(value || '').trim()
  if (!raw) return ''
  const noQuery = raw.split('?')[0]
  if (noQuery.includes(':')) {
    const parts = noQuery.split(':')
    return parts[parts.length - 1] || raw
  }
  return noQuery
}

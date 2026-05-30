/** Parse a raw QR payload into a wallet address (strips URI scheme/query). */
export function extractWalletAddress(value: string): string {
  const raw = String(value || '').trim()
  if (!raw) return ''

  const lower = raw.toLowerCase()
  if (lower.startsWith('tron:')) {
    return raw.slice(raw.indexOf(':') + 1).split('?')[0].trim()
  }
  if (lower.startsWith('solana:') || lower.startsWith('sol:')) {
    return raw.slice(raw.indexOf(':') + 1).split('?')[0].trim()
  }
  if (lower.startsWith('ethereum:') || lower.startsWith('eip155:')) {
    const after = raw.slice(raw.indexOf(':') + 1)
    const pathPart = after.split('?')[0]
    if (pathPart.includes('/')) return pathPart.split('/').pop()?.trim() || pathPart.trim()
    return pathPart.trim()
  }

  const noQuery = raw.split('?')[0]
  if (noQuery.includes(':')) {
    const parts = noQuery.split(':')
    return parts[parts.length - 1] || raw
  }
  return noQuery
}

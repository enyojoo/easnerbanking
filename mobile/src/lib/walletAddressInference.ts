import { getApiBaseUrl, getNoahScopeHeaders } from './apiClient'
import { getSessionReliable } from './authSession'

export type AddressInferenceCandidate = {
  asset: string
  network: string
  confidence: 'high' | 'medium' | 'low'
  reason: string
}

export async function inferWalletAddressFromApi(address: string): Promise<{
  candidates: AddressInferenceCandidate[]
  best: AddressInferenceCandidate | null
}> {
  const session = await getSessionReliable()
  if (!session?.access_token) throw new Error('Not authenticated')
  const scopeHeaders = await getNoahScopeHeaders()
  const res = await fetch(`${getApiBaseUrl()}/api/wallets/send/infer-address`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
      ...scopeHeaders,
    },
    body: JSON.stringify({ address }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error((data as { error?: string }).error || 'Inference failed')
  }
  return data as { candidates: AddressInferenceCandidate[]; best: AddressInferenceCandidate | null }
}

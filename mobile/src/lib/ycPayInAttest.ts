import { apiFetch } from '../query/api-client'
import type { PayInProviderId } from '@easner/shared'

export async function attestYcPayInPayment(input: {
  transactionId: string
  transferId: string
  provider?: PayInProviderId
}): Promise<{ attestedAt: string; alreadyAttested: boolean }> {
  const provider = input.provider ?? 'yellowcard'
  const path =
    provider === 'grid' ? '/api/grid/pay-in/ack' : '/api/yellowcard/pay-in/attest'
  const data = await apiFetch<
    { ok: true; attestedAt: string; alreadyAttested?: boolean },
    { transactionId: string; transferId: string }
  >(path, {
    method: 'POST',
    body: {
      transactionId: input.transactionId.trim(),
      transferId: input.transferId.trim(),
    },
  })
  if (!data.ok || !data.attestedAt) {
    throw new Error('Could not confirm payment')
  }
  return { attestedAt: data.attestedAt, alreadyAttested: Boolean(data.alreadyAttested) }
}

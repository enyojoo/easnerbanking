import { apiFetch } from '../query/api-client'

export async function attestYcPayInPayment(input: {
  transactionId: string
  transferId: string
}): Promise<{ attestedAt: string; alreadyAttested: boolean }> {
  const data = await apiFetch<
    { ok: true; attestedAt: string; alreadyAttested: boolean },
    { transactionId: string; transferId: string }
  >('/api/yellowcard/pay-in/attest', {
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

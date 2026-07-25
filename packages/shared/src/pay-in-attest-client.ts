import type { PayInProviderId } from "./payout-provider-limits"

export type PayInAttestResult = {
  attestedAt: string
  alreadyAttested?: boolean
}

export type PayInAttestFetch = (
  url: string,
  init: { method: string; headers?: Record<string, string>; body?: string },
) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>

function payInAttestPath(provider: PayInProviderId): string {
  if (provider === "grid") return "/api/grid/pay-in/ack"
  return "/api/yellowcard/pay-in/attest"
}

/** Provider-aware pay-in attestation (Grid ack vs YC attest). */
export async function attestPayInPayment(input: {
  provider: PayInProviderId
  transactionId: string
  transferId?: string
  fetch: PayInAttestFetch
}): Promise<PayInAttestResult> {
  const transactionId = input.transactionId.trim()
  const transferId = String(input.transferId ?? "").trim()
  if (!transactionId) {
    throw new Error("transactionId required")
  }

  const res = await input.fetch(payInAttestPath(input.provider), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      transactionId,
      ...(transferId ? { transferId } : {}),
    }),
  })

  const data = (await res.json().catch(() => null)) as {
    ok?: boolean
    attestedAt?: string
    alreadyAttested?: boolean
    message?: string
  } | null

  if (!res.ok || !data?.ok || !data.attestedAt) {
    throw new Error(data?.message || "Could not confirm payment")
  }

  return {
    attestedAt: data.attestedAt,
    alreadyAttested: Boolean(data.alreadyAttested),
  }
}

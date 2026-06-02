import { fetchWithSession } from "@/lib/fetch-with-session"

export type AddressInferenceCandidate = {
  asset: string
  network: string
  confidence: "high" | "medium" | "low"
  reason: string
}

export async function inferWalletAddressFromApi(address: string): Promise<{
  candidates: AddressInferenceCandidate[]
  best: AddressInferenceCandidate | null
}> {
  const trimmed = String(address || "").trim()
  if (!trimmed) {
    return { candidates: [], best: null }
  }

  const res = await fetchWithSession("/api/wallets/send/infer-address", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ address: trimmed }),
  })
  const data = (await res.json().catch(() => ({}))) as {
    candidates?: AddressInferenceCandidate[]
    best?: AddressInferenceCandidate | null
    error?: string
  }
  if (!res.ok) {
    throw new Error(data.error || "Could not detect asset and network for this address.")
  }
  return {
    candidates: data.candidates ?? [],
    best: data.best ?? null,
  }
}

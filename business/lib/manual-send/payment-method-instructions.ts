export type StablecoinPayInInstructions = {
  wallet_address?: string
  network?: string
  memo?: string
}

export function parseStablecoinInstructions(
  instructions: string | null | undefined,
): StablecoinPayInInstructions {
  if (!instructions?.trim()) return {}
  try {
    const j = JSON.parse(instructions) as Record<string, unknown>
    if (!j || typeof j !== "object") return {}
    return {
      wallet_address:
        typeof j.wallet_address === "string"
          ? j.wallet_address
          : typeof j.walletAddress === "string"
            ? j.walletAddress
            : undefined,
      network: typeof j.network === "string" ? j.network : undefined,
      memo: typeof j.memo === "string" ? j.memo : undefined,
    }
  } catch {
    return {}
  }
}

export function buildStablecoinInstructions(input: StablecoinPayInInstructions): string {
  return JSON.stringify({
    wallet_address: input.wallet_address?.trim() || null,
    network: input.network?.trim() || null,
    memo: input.memo?.trim() || null,
  })
}

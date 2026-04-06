import { createHash } from "crypto"
import { PLACARD_TEMPLATE_VERSION } from "./constants"

export type PlacardHashInput = {
  label: string | null
  cryptoCurrency: string
  network: string
  depositAddress: string
  depositMemo: string | null
  qrPayload: string
}

export function computePlacardContentHash(input: PlacardHashInput): string {
  const payload = JSON.stringify({
    v: PLACARD_TEMPLATE_VERSION,
    ...input,
  })
  return createHash("sha256").update(payload).digest("hex").slice(0, 32)
}

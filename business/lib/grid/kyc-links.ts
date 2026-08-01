import { gridFetch } from "./http"
import { getGridBusinessKybReturnUrl } from "./config"

export type GridKycLinkResponse = {
  kycUrl: string
  expiresAt?: string
  provider?: string
  token?: string
}

export async function createGridBusinessKycLink(input: {
  customerId: string
  redirectUri?: string
  idempotencyKey?: string
}): Promise<GridKycLinkResponse> {
  const redirectUri = input.redirectUri?.trim() || getGridBusinessKybReturnUrl()
  const res = await gridFetch<GridKycLinkResponse>({
    method: "POST",
    path: `/customers/${encodeURIComponent(input.customerId)}/kyc-link`,
    json: { redirectUri },
    idempotencyKey: input.idempotencyKey ?? `kyb-link:${input.customerId}`,
  })
  const kycUrl = String(res.kycUrl ?? "").trim()
  if (!kycUrl) throw new Error("Grid did not return kycUrl")
  return { ...res, kycUrl }
}

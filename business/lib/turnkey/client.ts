import { Turnkey } from "@turnkey/sdk-server"
import {
  getTurnkeyApiBaseUrl,
  getTurnkeyApiPrivateKey,
  getTurnkeyApiPublicKey,
  getTurnkeyOrganizationId,
  isTurnkeyConfigured,
} from "@/lib/turnkey/config"

let cached: Turnkey | null = null

export function getTurnkeyServer(): Turnkey | null {
  if (!isTurnkeyConfigured()) return null
  if (!cached) {
    cached = new Turnkey({
      apiBaseUrl: getTurnkeyApiBaseUrl(),
      apiPrivateKey: getTurnkeyApiPrivateKey(),
      apiPublicKey: getTurnkeyApiPublicKey(),
      defaultOrganizationId: getTurnkeyOrganizationId(),
    })
  }
  return cached
}

export function getTurnkeyApiClient() {
  const t = getTurnkeyServer()
  if (!t) return null
  return t.apiClient()
}

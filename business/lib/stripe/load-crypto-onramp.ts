"use client"

export type CryptoOnrampClient = {
  registerLinkUser: (info: Record<string, unknown>) => Promise<{ created?: boolean }>
  authenticate: (
    authIntentId: string,
    cb: (result: {
      result?: string
      crypto_customer_id?: string
      access_token?: string
      oauth_token?: string
    }) => void | Promise<void>,
  ) => Promise<HTMLElement | null>
  submitKycInfo: (info: Record<string, unknown>) => Promise<unknown>
  getMissingIdentifiers?: () => Promise<{
    identifiers?: Array<{ type?: string }>
    alternatives?: unknown[]
  }>
  updateKycInfo?: (info: Record<string, unknown>) => Promise<{ completed?: boolean }>
  promptUserAttestation?: (cb: (result: { result?: string }) => void) => Promise<HTMLElement | null>
  verifyDocuments?: (cb?: (result: unknown) => void) => Promise<HTMLElement | null>
  verifyIdentity?: (cb?: (result: unknown) => void) => Promise<HTMLElement | null>
  registerWalletAddress?: (address: string, network: string) => Promise<unknown>
  collectPaymentMethod: (
    opts: Record<string, unknown>,
    cb: (result: {
      cryptoPaymentToken?: string
      paymentMethodDetails?: Record<string, unknown>
    }) => void,
  ) => Promise<HTMLElement | null>
  performCheckout: (
    sessionId: string,
    callback: (id: string) => Promise<string | { client_secret?: string }>,
  ) => Promise<{ success?: boolean; result?: string }>
}

let cached: CryptoOnrampClient | null = null

export async function loadExpressOnramp(publishableKey: string): Promise<CryptoOnrampClient> {
  if (cached) return cached
  const mod = (await import("@stripe/crypto")) as {
    loadCryptoOnrampAndInitialize?: (pk: string, opts?: Record<string, unknown>) => Promise<CryptoOnrampClient>
    loadStripeOnramp?: (pk: string) => Promise<CryptoOnrampClient>
  }
  const loader = mod.loadCryptoOnrampAndInitialize || mod.loadStripeOnramp
  if (!loader) throw new Error("Express deposits is not available in this browser.")
  cached = await loader(publishableKey, { theme: "stripe" })
  return cached
}

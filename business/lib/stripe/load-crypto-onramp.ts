"use client"

import {
  EXPRESS_ONRAMP_APPEARANCE_REV,
  expressOnrampLinkConfigure,
  expressOnrampWebInitOptions,
} from "@easner/shared"

export type CryptoOnrampClient = {
  registerLinkUser: (
    email: string,
    phone: string,
    country: string,
    fullName?: string,
  ) => Promise<{ created?: boolean }>
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
let cachedFor: string | null = null
let inflight: Promise<CryptoOnrampClient> | null = null

async function tryConfigureWebOnramp(
  client: CryptoOnrampClient,
  cryptoCustomerId?: string | null,
): Promise<void> {
  const configure = (client as { configure?: (config: Record<string, unknown>) => Promise<unknown> }).configure
  if (typeof configure !== "function") return
  try {
    await configure(expressOnrampLinkConfigure(cryptoCustomerId) as Record<string, unknown>)
  } catch {
    // Optional on some CDN builds.
  }
}

/** Bind Link session to the SDK only after authenticate() — avoids controller.html 403 spam. */
export async function configureExpressOnrampLinkSession(
  client: CryptoOnrampClient,
  cryptoCustomerId?: string | null,
): Promise<void> {
  await tryConfigureWebOnramp(client, cryptoCustomerId)
}

export function prefetchExpressOnramp(): void {
  void import("@stripe/crypto")
}

export async function loadExpressOnramp(
  publishableKey: string,
  _cryptoCustomerId?: string | null,
): Promise<CryptoOnrampClient> {
  const cacheKey = `${publishableKey}:${EXPRESS_ONRAMP_APPEARANCE_REV}`
  if (cached && cachedFor === cacheKey) return cached
  if (inflight) return inflight
  inflight = (async () => {
    const mod = (await import("@stripe/crypto")) as {
      loadCryptoOnrampAndInitialize?: (pk: string, opts?: Record<string, unknown>) => Promise<CryptoOnrampClient>
      loadStripeOnramp?: (pk: string) => Promise<CryptoOnrampClient>
    }
    const loader = mod.loadCryptoOnrampAndInitialize || mod.loadStripeOnramp
    if (!loader) throw new Error("Express deposits is not available in this browser.")
    const client = await loader(publishableKey, expressOnrampWebInitOptions())
    // Appearance only on load; bind cryptoCustomerId after Link authenticate().
    await tryConfigureWebOnramp(client, null)
    cachedFor = cacheKey
    cached = client
    return cached
  })()
  try {
    return await inflight
  } finally {
    inflight = null
  }
}

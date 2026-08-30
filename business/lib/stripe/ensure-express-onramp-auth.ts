"use client"

import { EXPRESS_DEPOSITS_COPY, expressSetupUserMessage, isExpressSetupDismissed } from "@easner/shared"
import { fetchWithSession } from "@/lib/fetch-with-session"
import {
  configureExpressOnrampLinkSession,
  type CryptoOnrampClient,
} from "@/lib/stripe/load-crypto-onramp"

let readyFor: string | null = null

function sessionKey(cryptoCustomerId?: string | null): string {
  return String(cryptoCustomerId || "session").trim() || "session"
}

export async function ensureExpressOnrampAuthenticated(
  client: CryptoOnrampClient,
  cryptoCustomerId: string | null | undefined,
  onHost: (el: HTMLElement | null) => void,
): Promise<string | null> {
  if (readyFor === sessionKey(cryptoCustomerId)) return cryptoCustomerId ?? null

  const auth = await fetchWithSession("/api/stripe/onramp/link-auth", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  })
  const json = (await auth.json().catch(() => ({}))) as {
    authIntentId?: string | null
    needsRegister?: boolean
    error?: string
  }
  if (!auth.ok || json.needsRegister || !json.authIntentId) {
    throw new Error(json.error || EXPRESS_DEPOSITS_COPY.setupRequiredHint)
  }
  const intentId = json.authIntentId

  const result = await new Promise<Record<string, unknown>>((resolve, reject) => {
    let settled = false
    const finish = (fn: () => void) => {
      if (settled) return
      settled = true
      fn()
    }
    void client
      .authenticate(intentId, (raw) => {
        finish(() => resolve(raw && typeof raw === "object" ? raw : {}))
      })
      .then((el) => {
        if (el) onHost(el)
      })
      .catch((error) => finish(() => reject(error)))
  })

  const outcome = String(result.result || "")
  if (isExpressSetupDismissed(outcome) || /cancel/i.test(outcome)) {
    onHost(null)
    throw new Error(EXPRESS_DEPOSITS_COPY.setupDismissed)
  }
  const customerId = String(result.crypto_customer_id || cryptoCustomerId || "").trim()
  if (outcome && outcome !== "success" && !customerId) {
    onHost(null)
    throw new Error(expressSetupUserMessage(outcome))
  }
  if (customerId) {
    await configureExpressOnrampLinkSession(client, customerId)
    await fetchWithSession("/api/stripe/onramp/link-complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        cryptoCustomerId: customerId,
        accessToken: result.access_token || result.oauth_token,
        authIntentId: intentId,
      }),
    }).catch(() => undefined)
  }
  onHost(null)
  readyFor = sessionKey(customerId || cryptoCustomerId)
  return customerId || cryptoCustomerId || null
}

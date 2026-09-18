import { getInvoiceAppHostname, getPayAppHostname } from "@/lib/customer-hosts"
import { getStripe } from "../client"

function hostnameFromUrl(raw: string | null | undefined): string | null {
  const s = String(raw ?? "").trim()
  if (!s) return null
  try {
    const host = new URL(s.includes("://") ? s : `https://${s}`).hostname.toLowerCase()
    return host || null
  } catch {
    return null
  }
}

export function connectPaymentMethodHosts(extra: Array<string | null | undefined> = []): string[] {
  const hosts = new Set<string>()
  for (const host of [getInvoiceAppHostname(), getPayAppHostname(), "invoice.easner.com", "pay.easner.com"]) {
    if (host) hosts.add(host)
  }
  for (const raw of extra) {
    const host = hostnameFromUrl(raw)
    if (host) hosts.add(host)
  }
  return [...hosts]
}

/**
 * Wallet methods (Apple Pay / Google Pay / Link) require the domain on the
 * connected account that accepts Direct Charges.
 */
export async function ensureConnectedPaymentMethodDomains(input: {
  stripeAccountId: string
  extraHosts?: Array<string | null | undefined>
  livemode?: boolean
}): Promise<void> {
  const stripeAccountId = input.stripeAccountId.trim()
  if (!stripeAccountId) return
  const stripe = getStripe(input.livemode !== false)
  const hosts = connectPaymentMethodHosts(input.extraHosts)
  await Promise.all(
    hosts.map(async (domainName) => {
      try {
        await stripe.paymentMethodDomains.create(
          { domain_name: domainName },
          { stripeAccount: stripeAccountId },
        )
      } catch (error) {
        const code =
          error && typeof error === "object" && "code" in error
            ? String((error as { code?: unknown }).code ?? "")
            : ""
        const message = error instanceof Error ? error.message : String(error)
        if (code === "resource_already_exists" || /already exists/i.test(message)) return
        console.warn("[stripe-connect] payment method domain", domainName, message)
      }
    }),
  )
}

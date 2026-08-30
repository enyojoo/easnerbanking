import { NextResponse } from "next/server"
import { expressDepositsStatusIsReady } from "@easner/shared"
import { encryptLinkOAuthSecrets } from "@/lib/stripe/onramp-oauth"
import { StripeOnrampApiError, retrieveLinkAuthTokens } from "@/lib/stripe/onramp-client"
import { patchExpressPayer, resolveExpressDepositsContext } from "@/lib/stripe/onramp-context"

export const runtime = "nodejs"

export async function POST(request: Request) {
  const resolved = await resolveExpressDepositsContext(request)
  if ("error" in resolved) return resolved.error
  const body = (await request.json().catch(() => ({}))) as {
    cryptoCustomerId?: string
    accessToken?: string
    oauthToken?: string
    authIntentId?: string
  }
  const cryptoCustomerId = String(body.cryptoCustomerId || "").trim()
  let accessToken = String(body.accessToken || body.oauthToken || "").trim()
  let refreshToken = ""
  const authIntentId = String(body.authIntentId || "").trim()
  if (!cryptoCustomerId) {
    return NextResponse.json({ error: "cryptoCustomerId required" }, { status: 400 })
  }
  if (authIntentId) {
    try {
      const tokens = await retrieveLinkAuthTokens(authIntentId)
      accessToken = String(tokens.access_token || accessToken).trim()
      refreshToken = String(tokens.refresh_token || "").trim()
    } catch (e) {
      if (!accessToken) {
        if (e instanceof StripeOnrampApiError) {
          return NextResponse.json({ error: e.message, code: e.code }, { status: e.status >= 400 ? e.status : 400 })
        }
        throw e
      }
    }
  }
  const patch: Record<string, unknown> = {
    stripe_crypto_customer_id: cryptoCustomerId,
  }
  if (
    !expressDepositsStatusIsReady({
      status: resolved.ctx.payer.stripe_express_deposits_status,
    })
  ) {
    patch.stripe_express_deposits_status = "in_progress"
  }
  if (accessToken) {
    patch.stripe_link_oauth_token_ciphertext = encryptLinkOAuthSecrets({
      access_token: accessToken,
      refresh_token: refreshToken || undefined,
    })
  }
  await patchExpressPayer(resolved.ctx.admin, resolved.ctx.payerUserId, patch)
  return NextResponse.json({ ok: true, cryptoCustomerId })
}

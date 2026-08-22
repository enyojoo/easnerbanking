import { NextResponse } from "next/server"
import { encryptLinkOAuthToken } from "@/lib/stripe/onramp-oauth"
import { patchExpressPayer, resolveExpressDepositsContext } from "@/lib/stripe/onramp-context"

export const runtime = "nodejs"

export async function POST(request: Request) {
  const resolved = await resolveExpressDepositsContext(request)
  if ("error" in resolved) return resolved.error
  const body = (await request.json().catch(() => ({}))) as {
    cryptoCustomerId?: string
    accessToken?: string
    oauthToken?: string
  }
  const cryptoCustomerId = String(body.cryptoCustomerId || "").trim()
  const accessToken = String(body.accessToken || body.oauthToken || "").trim()
  if (!cryptoCustomerId) {
    return NextResponse.json({ error: "cryptoCustomerId required" }, { status: 400 })
  }
  const patch: Record<string, unknown> = {
    stripe_crypto_customer_id: cryptoCustomerId,
    stripe_express_deposits_status: "in_progress",
  }
  if (accessToken) patch.stripe_link_oauth_token_ciphertext = encryptLinkOAuthToken(accessToken)
  await patchExpressPayer(resolved.ctx.admin, resolved.ctx.payerUserId, patch)
  return NextResponse.json({ ok: true, cryptoCustomerId })
}

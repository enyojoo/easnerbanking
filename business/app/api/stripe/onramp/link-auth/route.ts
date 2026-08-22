import { NextResponse } from "next/server"
import { EXPRESS_DEPOSITS_COPY, expressSetupUserMessage } from "@easner/shared"
import { StripeOnrampApiError, createLinkAuthIntent } from "@/lib/stripe/onramp-client"
import { resolveExpressDepositsContext } from "@/lib/stripe/onramp-context"
import { mapStripeOnrampError } from "@/lib/stripe/onramp-sdk-map"

export const runtime = "nodejs"

function mapError(e: unknown) {
  if (e instanceof StripeOnrampApiError) {
    return NextResponse.json(
      {
        error: expressSetupUserMessage(mapStripeOnrampError(e.code, e.message)),
        code: e.code,
      },
      { status: e.status >= 400 ? e.status : 400 },
    )
  }
  return NextResponse.json(
    { error: EXPRESS_DEPOSITS_COPY.somethingWentWrong },
    { status: 400 },
  )
}

export async function POST(request: Request) {
  const resolved = await resolveExpressDepositsContext(request)
  if ("error" in resolved) return resolved.error
  try {
    const intent = await createLinkAuthIntent({
      email: resolved.ctx.payer.email || undefined,
      oauthToken: resolved.ctx.oauthToken || undefined,
    })
    return NextResponse.json({
      authIntentId: (intent as { id?: string }).id ?? null,
      needsRegister: false,
      intent,
    })
  } catch (e) {
    if (e instanceof StripeOnrampApiError && e.status === 404) {
      return NextResponse.json({ authIntentId: null, needsRegister: true })
    }
    return mapError(e)
  }
}

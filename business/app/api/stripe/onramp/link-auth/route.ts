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

function linkAuthEmail(ctx: {
  payer: { email?: string | null }
  actorEmail?: string | null
}): string | undefined {
  const email = String(ctx.payer.email || ctx.actorEmail || "").trim()
  return email || undefined
}

export async function POST(request: Request) {
  const resolved = await resolveExpressDepositsContext(request)
  if ("error" in resolved) return resolved.error
  const email = linkAuthEmail(resolved.ctx)
  try {
    /** Client authenticate() needs a fresh LinkAuthIntent — never attach a stored OAuth token. */
    const intent = await createLinkAuthIntent({
      email,
      forClientAuth: true,
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
    if (e instanceof StripeOnrampApiError && e.status === 409) {
      return NextResponse.json(
        {
          error: expressSetupUserMessage("Link connection was revoked. Sign in again."),
          code: e.code,
        },
        { status: 409 },
      )
    }
    return mapError(e)
  }
}

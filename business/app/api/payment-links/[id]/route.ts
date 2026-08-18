import { NextResponse } from "next/server"
import { buildPaymentLinkUrl } from "@/lib/payment-links/public-url"
import { mapRowToPaymentLink } from "@/lib/payment-links/types"
import { getStripe } from "@/lib/stripe/client"
import { createSupabaseAdmin, getUserFromApiRequest } from "@/lib/supabase/admin"
import { requireEasnerBusinessId } from "@/lib/terminal/context"

const LINK_COLUMNS =
  "id, public_id, slug, label, description, amount_cents, currency, rail, mode, billing_interval, trial_days, redirect_url, stripe_price_id, autopayout_config_id, payment_count, archived_at, created_at"

type Ctx = { params: Promise<{ id: string }> }

/** Closing a recurring link stops future charges for everyone already subscribed to it. */
async function cancelSubscriptionsForLink(
  admin: ReturnType<typeof createSupabaseAdmin>,
  linkId: string,
): Promise<void> {
  const { data: sessions } = await admin
    .from("online_checkout_sessions")
    .select("stripe_subscription_id")
    .eq("payment_link_id", linkId)
    .not("stripe_subscription_id", "is", null)

  const subscriptionIds = [
    ...new Set(
      (sessions ?? [])
        .map((row) => String(row.stripe_subscription_id ?? "").trim())
        .filter(Boolean),
    ),
  ]

  const stripe = getStripe()
  for (const subscriptionId of subscriptionIds) {
    try {
      await stripe.subscriptions.cancel(subscriptionId)
    } catch {
      // Already canceled or unknown to the provider — closing the link still stands.
    }
  }
}

/** Edit the presentation of a link or archive it. Amounts lock once a link has been paid. */
export async function PATCH(request: Request, context: Ctx) {
  const user = await getUserFromApiRequest(request)
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const ctx = await requireEasnerBusinessId(user.id)
  if (!ctx.ok) return ctx.response

  const { id } = await context.params
  const linkId = String(id || "").trim()
  if (!linkId) {
    return NextResponse.json({ error: "Invalid id." }, { status: 400 })
  }

  const body = (await request.json().catch(() => null)) as {
    label?: string | null
    description?: string | null
    redirect_url?: string | null
    amount?: number | string
    archived?: boolean
  } | null

  const admin = createSupabaseAdmin()
  const { data: existing, error: exErr } = await admin
    .from("payment_links")
    .select("id, payment_count, mode")
    .eq("id", linkId)
    .eq("business_id", ctx.businessId)
    .maybeSingle()

  if (exErr) {
    return NextResponse.json({ error: exErr.message }, { status: 400 })
  }
  if (!existing) {
    return NextResponse.json({ error: "Not found." }, { status: 404 })
  }

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }

  if (body && "label" in body) {
    const label = String(body.label ?? "").trim().slice(0, 200)
    if (!label) {
      return NextResponse.json({ error: "Add a name for this link" }, { status: 400 })
    }
    patch.label = label
  }

  if (body && "description" in body) {
    patch.description = String(body.description ?? "").trim().slice(0, 500) || null
  }

  if (body && "redirect_url" in body) {
    const redirectRaw = String(body.redirect_url ?? "").trim()
    if (!redirectRaw) {
      patch.redirect_url = null
    } else {
      try {
        const parsed = new URL(redirectRaw)
        if (parsed.protocol !== "https:") throw new Error("insecure")
        patch.redirect_url = parsed.toString()
      } catch {
        return NextResponse.json(
          { error: "Enter a full https:// address for the page customers land on" },
          { status: 400 },
        )
      }
    }
  }

  if (body && body.amount !== undefined) {
    if (Number(existing.payment_count ?? 0) > 0) {
      return NextResponse.json(
        { error: "This link has already been paid. Create a new link to change the amount." },
        { status: 409 },
      )
    }
    if (existing.mode === "subscription") {
      return NextResponse.json(
        { error: "Recurring amounts cannot be edited. Create a new link instead." },
        { status: 409 },
      )
    }
    const amountCents = Math.round(Number(body.amount) * 100)
    if (!Number.isFinite(amountCents) || amountCents <= 0) {
      return NextResponse.json({ error: "Amount must be greater than zero" }, { status: 400 })
    }
    patch.amount_cents = amountCents
  }

  if (body && typeof body.archived === "boolean") {
    patch.archived_at = body.archived ? new Date().toISOString() : null
    if (body.archived && existing.mode === "subscription") {
      await cancelSubscriptionsForLink(admin, linkId)
    }
  }

  const { data: updated, error } = await admin
    .from("payment_links")
    .update(patch)
    .eq("id", linkId)
    .eq("business_id", ctx.businessId)
    .select(LINK_COLUMNS)
    .single()

  if (error || !updated) {
    return NextResponse.json({ error: error?.message || "Could not save link" }, { status: 400 })
  }

  const { data: biz } = await admin
    .from("businesses")
    .select("easetag")
    .eq("id", ctx.businessId)
    .maybeSingle()
  const link = mapRowToPaymentLink(updated as Record<string, unknown>)

  return NextResponse.json({
    link: {
      ...link,
      url: buildPaymentLinkUrl(typeof biz?.easetag === "string" ? biz.easetag : null, link),
    },
  })
}

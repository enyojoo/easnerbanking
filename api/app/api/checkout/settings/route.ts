import { NextResponse } from "next/server"
import {
  MERCHANT_WEBHOOK_EVENT_DESCRIPTIONS,
  MERCHANT_WEBHOOK_EVENTS,
  normalizeSubscribedWebhookEvents,
  type MerchantWebhookEvent,
} from "@/lib/checkout/merchant-webhooks"
import {
  checkoutKeyLast4,
  encryptCheckoutSecret,
  generateWebhookSigningSecret,
} from "@/lib/checkout/secrets"
import { mapCheckoutSite } from "@/lib/checkout/map-checkout-site"
import { normalizeOrigin, normalizeReturnUrl } from "@/lib/checkout/normalize-checkout-url"
import { BUSINESS_SELECTABLE_FEE_MODES, resolveCheckoutFeeMode } from "@/lib/stripe/checkout-fee-mode"
import { parseCheckoutFeeMode } from "@/lib/stripe/checkout-fee-mode"
import { resolveConnectReadyForCheckout } from "@/lib/stripe/connect"
import { resolveOnlinePaymentsEnabled } from "@/lib/stripe/resolve-online-payments-enabled"
import { isOnlineCheckoutEnabled } from "@/lib/stripe/config"
import { createSupabaseAdmin, getUserFromApiRequest } from "@/lib/supabase/admin"
import { requireEasnerBusinessId } from "@/lib/terminal/context"

const SETTINGS_COLUMNS =
  "business_id, fee_mode, allowed_origins, default_success_url, default_cancel_url, appearance, webhook_url, webhook_secret_last4, live_mode_enabled, test_payment_completed_at, online_payments_enabled"

export async function GET(request: Request) {
  const user = await getUserFromApiRequest(request)
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const ctx = await requireEasnerBusinessId(user.id)
  if (!ctx.ok) return ctx.response

  const admin = createSupabaseAdmin()
  const [{ data: settings }, feeMode, onlinePayments, { data: keys }, { data: siteRows }, { data: lastDelivery }, eventsRow] = await Promise.all([
    admin.from("business_checkout_settings").select(SETTINGS_COLUMNS).eq("business_id", ctx.businessId).maybeSingle(),
    resolveCheckoutFeeMode(admin, ctx.businessId),
    resolveOnlinePaymentsEnabled(admin, ctx.businessId),
    admin
      .from("business_api_keys")
      .select("id, mode, publishable_key, secret_key_last4, created_at, last_used_at")
      .eq("business_id", ctx.businessId)
      .is("revoked_at", null)
      .order("created_at", { ascending: false }),
    admin
      .from("business_checkout_sites")
      .select("id, origin, success_url, cancel_url, created_at, updated_at")
      .eq("business_id", ctx.businessId)
      .order("created_at", { ascending: true }),
    admin
      .from("checkout_webhook_deliveries")
      .select("delivered_at")
      .eq("business_id", ctx.businessId)
      .eq("status", "delivered")
      .order("delivered_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    admin
      .from("business_checkout_settings")
      .select("webhook_events")
      .eq("business_id", ctx.businessId)
      .maybeSingle(),
  ])

  const connect =
    isOnlineCheckoutEnabled() && onlinePayments.enabled
      ? await resolveConnectReadyForCheckout(admin, ctx.businessId)
      : {
          ready: false,
          reason: onlinePayments.enabled
            ? "Online payments are not enabled"
            : "Online payments are turned off in Settings",
        }

  return NextResponse.json({
    settings: {
      feeMode: feeMode.feeMode,
      businessFeeMode: feeMode.businessFeeMode,
      feeModeManagedByEasner: Boolean(feeMode.overrideFeeMode),
      allowedOrigins: Array.isArray(settings?.allowed_origins) ? settings.allowed_origins : [],
      defaultSuccessUrl: settings?.default_success_url ?? null,
      defaultCancelUrl: settings?.default_cancel_url ?? null,
      webhookUrl: settings?.webhook_url ?? null,
      webhookSecretLast4: settings?.webhook_secret_last4 ?? null,
      liveModeEnabled: Boolean(settings?.live_mode_enabled),
      testPaymentCompletedAt: settings?.test_payment_completed_at ?? null,
      lastWebhookDeliveredAt: lastDelivery?.delivered_at ?? null,
      onlinePaymentsEnabled: onlinePayments.enabled,
      subscribedWebhookEvents: normalizeSubscribedWebhookEvents(eventsRow.data?.webhook_events),
    },
    readiness: {
      ready: connect.ready,
      reason: connect.ready ? null : (connect.reason ?? null),
    },
    keys: keys ?? [],
    sites: (siteRows ?? []).map((row) => mapCheckoutSite(row as Parameters<typeof mapCheckoutSite>[0])),
    webhookEvents: MERCHANT_WEBHOOK_EVENT_DESCRIPTIONS,
  })
}

export async function PATCH(request: Request) {
  const user = await getUserFromApiRequest(request)
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const ctx = await requireEasnerBusinessId(user.id)
  if (!ctx.ok) return ctx.response

  const body = (await request.json().catch(() => null)) as {
    fee_mode?: string
    online_payments_enabled?: boolean
    allowed_origins?: string[]
    default_success_url?: string | null
    default_cancel_url?: string | null
    webhook_url?: string | null
    rotate_webhook_secret?: boolean
    live_mode_enabled?: boolean
    test_payment_completed?: boolean
    webhook_events?: string[]
  } | null

  const admin = createSupabaseAdmin()
  const patch: Record<string, unknown> = {
    business_id: ctx.businessId,
    updated_at: new Date().toISOString(),
  }
  let webhookSecret: string | null = null

  if (body?.fee_mode !== undefined) {
    const { overrideFeeMode } = await resolveCheckoutFeeMode(admin, ctx.businessId)
    if (overrideFeeMode) {
      return NextResponse.json(
        { error: "Your processing fee setting is managed by Easner." },
        { status: 409 },
      )
    }
    const feeMode = parseCheckoutFeeMode(body.fee_mode)
    if (!feeMode || !BUSINESS_SELECTABLE_FEE_MODES.includes(feeMode)) {
      return NextResponse.json({ error: "Choose a valid fee option" }, { status: 400 })
    }
    patch.fee_mode = feeMode
  }

  if (body?.online_payments_enabled !== undefined) {
    patch.online_payments_enabled = Boolean(body.online_payments_enabled)
  }

  if (body?.allowed_origins !== undefined) {
    const origins: string[] = []
    for (const raw of body.allowed_origins) {
      const origin = normalizeOrigin(String(raw))
      if (!origin) {
        return NextResponse.json(
          { error: `${raw} is not a valid https:// website address` },
          { status: 400 },
        )
      }
      if (!origins.includes(origin)) origins.push(origin)
    }
    patch.allowed_origins = origins
  }

  for (const [key, column] of [
    ["default_success_url", "default_success_url"],
    ["default_cancel_url", "default_cancel_url"],
  ] as const) {
    if (body?.[key] === undefined) continue
    const raw = String(body[key] ?? "")
    if (!raw.trim()) {
      patch[column] = null
      continue
    }
    const url = normalizeReturnUrl(raw)
    if (!url) {
      return NextResponse.json(
        { error: "Enter a full https:// address customers return to" },
        { status: 400 },
      )
    }
    patch[column] = url
  }

  if (body?.webhook_url !== undefined) {
    const raw = String(body.webhook_url ?? "")
    if (!raw.trim()) {
      patch.webhook_url = null
    } else {
      const url = normalizeReturnUrl(raw)
      if (!url) {
        return NextResponse.json(
          { error: "Enter a full https:// address for your webhook endpoint" },
          { status: 400 },
        )
      }
      patch.webhook_url = url
    }
  }

  if (body?.webhook_events !== undefined) {
    const allowed = new Set<string>(MERCHANT_WEBHOOK_EVENTS)
    const events = (Array.isArray(body.webhook_events) ? body.webhook_events : [])
      .map(String)
      .filter((event): event is MerchantWebhookEvent => allowed.has(event))
    patch.webhook_events = events
  }

  if (body?.rotate_webhook_secret) {
    webhookSecret = generateWebhookSigningSecret()
    const { ciphertext, keyId } = encryptCheckoutSecret(webhookSecret)
    patch.webhook_secret_ciphertext = ciphertext
    patch.webhook_secret_key_id = keyId
    patch.webhook_secret_last4 = checkoutKeyLast4(webhookSecret)
  }

  if (body?.test_payment_completed) {
    patch.test_payment_completed_at = new Date().toISOString()
  }

  if (body?.live_mode_enabled !== undefined) {
    if (body.live_mode_enabled) {
      const connect = await resolveConnectReadyForCheckout(admin, ctx.businessId)
      if (!connect.ready) {
        return NextResponse.json(
          { error: connect.reason || "Finish online payment setup before going live." },
          { status: 409 },
        )
      }
      const [{ data: settingsRow }, { data: delivered }] = await Promise.all([
        admin
          .from("business_checkout_settings")
          .select("test_payment_completed_at")
          .eq("business_id", ctx.businessId)
          .maybeSingle(),
        admin
          .from("checkout_webhook_deliveries")
          .select("id")
          .eq("business_id", ctx.businessId)
          .eq("status", "delivered")
          .limit(1)
          .maybeSingle(),
      ])
      if (!settingsRow?.test_payment_completed_at) {
        return NextResponse.json(
          { error: "Complete a test payment before going live." },
          { status: 409 },
        )
      }
      if (!delivered?.id) {
        return NextResponse.json(
          { error: "Deliver a webhook successfully (HTTP 200) before going live." },
          { status: 409 },
        )
      }
    }
    patch.live_mode_enabled = Boolean(body.live_mode_enabled)
  }

  const { error } = await admin
    .from("business_checkout_settings")
    .upsert(patch, { onConflict: "business_id" })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  return NextResponse.json({
    ok: true,
    // Shown once; only the last 4 are stored for display afterwards.
    ...(webhookSecret ? { webhookSecret } : {}),
  })
}

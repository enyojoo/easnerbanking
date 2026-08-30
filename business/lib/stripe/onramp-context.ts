import type { SupabaseClient } from "@supabase/supabase-js"
import { requireAuth, resolveNoahContextAsync } from "@/app/api/noah/_helpers"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { resolveBusinessOrgOwnerUserId } from "@/lib/business/org-owner"
import {
  expressDepositsPayerCountry,
  expressDepositsPersistStatus,
  type ExpressDepositsNextStep,
} from "@easner/shared"
import { isStripeOnrampEnabled } from "@/lib/stripe/onramp-config"
import { isExpressDepositsPayerEligible } from "@/lib/stripe/onramp-gate"
import { decryptLinkOAuthSecrets, encryptLinkOAuthSecrets } from "@/lib/stripe/onramp-oauth"
import { NextResponse } from "next/server"
import { refreshLinkAccessToken, StripeOnrampApiError, stripeOnramp } from "@/lib/stripe/onramp-client"

export const EXPRESS_USER_COLUMNS =
  "id,email,full_name,phone,date_of_birth,residence_country,kyc_id_type,kyc_id_number,kyc_id_issuing_country,kyc_address_street,kyc_address_city,kyc_address_state,kyc_address_post_code,kyc_address_country,stripe_crypto_customer_id,stripe_express_deposits_status,stripe_express_kyc_tier,stripe_express_payment_token_id,stripe_express_payment_methods,stripe_link_oauth_token_ciphertext"

export type ExpressUserRow = {
  id: string
  email?: string | null
  full_name?: string | null
  phone?: string | null
  date_of_birth?: string | null
  residence_country?: string | null
  kyc_id_type?: string | null
  kyc_id_number?: string | null
  kyc_id_issuing_country?: string | null
  kyc_address_street?: string | null
  kyc_address_city?: string | null
  kyc_address_state?: string | null
  kyc_address_post_code?: string | null
  kyc_address_country?: string | null
  stripe_crypto_customer_id?: string | null
  stripe_express_deposits_status?: string | null
  stripe_express_kyc_tier?: string | null
  stripe_express_payment_token_id?: string | null
  stripe_express_payment_methods?: unknown
  stripe_link_oauth_token_ciphertext?: string | null
}

export async function resolveExpressDepositsContext(
  request: Request,
  opts?: { requireEligible?: boolean },
) {
  if (!isStripeOnrampEnabled()) {
    return {
      error: NextResponse.json({ error: "Express deposits is not available." }, { status: 503 }),
    } as const
  }

  const auth = await requireAuth(request)
  if ("error" in auth) return { error: auth.error } as const

  const noahCtxResult = await resolveNoahContextAsync(auth.user.id, request)
  if (!noahCtxResult.ok) return { error: noahCtxResult.response } as const

  const admin = createSupabaseAdmin()
  const businessId = noahCtxResult.scope === "business" ? noahCtxResult.businessId : null
  const orgOwnerId =
    businessId ? await resolveBusinessOrgOwnerUserId(admin, businessId).catch(() => null) : null
  const payerUserId = orgOwnerId ?? auth.user.id

  if (businessId && orgOwnerId && orgOwnerId !== auth.user.id) {
    return {
      error: NextResponse.json(
        { error: "Only the account owner can set up Express deposits." },
        { status: 403 },
      ),
    } as const
  }

  const { data: payer } = await admin
    .from("users")
    .select(EXPRESS_USER_COLUMNS)
    .eq("id", payerUserId)
    .maybeSingle()

  if (!payer) {
    return { error: NextResponse.json({ error: "Payer not found" }, { status: 404 }) } as const
  }

  const country = expressDepositsPayerCountry({
    residenceCountry: payer.residence_country,
    kycAddressCountry: payer.kyc_address_country,
  })
  const eligible = isExpressDepositsPayerEligible({
    country,
    state: payer.kyc_address_state,
  })
  if (opts?.requireEligible !== false && !eligible) {
    return {
      error: NextResponse.json({ error: "Express deposits is not available in your region." }, { status: 403 }),
    } as const
  }

  const row = payer as ExpressUserRow
  const secrets = decryptLinkOAuthSecrets(row.stripe_link_oauth_token_ciphertext)
  return {
    ctx: {
      admin,
      actorUserId: auth.user.id,
      actorEmail: auth.user.email ?? null,
      payerUserId,
      businessId,
      payer: row,
      payerCountry: country,
      eligible,
      oauthToken: secrets?.access_token || "",
      oauthRefreshToken: secrets?.refresh_token || "",
    },
  } as const
}

export async function patchExpressPayer(
  admin: SupabaseClient,
  userId: string,
  patch: Record<string, unknown>,
): Promise<void> {
  await admin.from("users").update(patch).eq("id", userId)
}

export async function persistExpressDepositsKyc(
  admin: SupabaseClient,
  userId: string,
  current: ExpressUserRow,
  input: {
    nextStep: ExpressDepositsNextStep
    kycTier: string | null
  },
): Promise<void> {
  const status = expressDepositsPersistStatus(input.nextStep)
  const tier = input.kycTier || null
  if (
    current.stripe_express_deposits_status === status &&
    (current.stripe_express_kyc_tier || null) === tier
  ) {
    return
  }
  await patchExpressPayer(admin, userId, {
    stripe_express_deposits_status: status,
    stripe_express_kyc_tier: tier,
  })
}

function isOAuthAuthFailure(e: unknown): boolean {
  return e instanceof StripeOnrampApiError && (e.status === 400 || e.status === 401)
}

/** Retrieve CryptoCustomer with a live Link token; refresh + persist if the access token expired. */
export async function retrieveExpressCustomerWithOAuth(input: {
  admin: SupabaseClient
  payerUserId: string
  customerId: string
  oauthToken: string
  oauthRefreshToken: string
}): Promise<{ customer: unknown; oauthToken: string }> {
  const retrieve = (token: string) => stripeOnramp.retrieveCustomer(input.customerId, token || undefined)
  try {
    return { customer: await retrieve(input.oauthToken), oauthToken: input.oauthToken }
  } catch (e) {
    if (!isOAuthAuthFailure(e) || !input.oauthRefreshToken) throw e
    const refreshed = await refreshLinkAccessToken(input.oauthRefreshToken)
    const access = refreshed.access_token
    const refresh = refreshed.refresh_token || input.oauthRefreshToken
    await patchExpressPayer(input.admin, input.payerUserId, {
      stripe_link_oauth_token_ciphertext: encryptLinkOAuthSecrets({
        access_token: access,
        refresh_token: refresh,
      }),
    })
    return { customer: await retrieve(access), oauthToken: access }
  }
}

function dobParts(raw: string | null | undefined): { day?: number; month?: number; year?: number } {
  const s = String(raw || "").trim()
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s)
  if (!m) return {}
  return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) }
}

export function kycPrefillFromPayer(payer: ExpressUserRow): Record<string, unknown> {
  const name = String(payer.full_name || "").trim()
  const parts = name.split(/\s+/).filter(Boolean)
  const givenName = parts[0] || undefined
  const surname = parts.length > 1 ? parts.slice(1).join(" ") : undefined
  const country = payer.kyc_address_country || payer.residence_country || undefined
  return {
    given_name: givenName,
    surname,
    first_name: givenName,
    last_name: surname,
    email: payer.email || undefined,
    phone: payer.phone || undefined,
    date_of_birth: dobParts(payer.date_of_birth),
    dob: payer.date_of_birth || undefined,
    address: {
      line1: payer.kyc_address_street || undefined,
      city: payer.kyc_address_city || undefined,
      state: payer.kyc_address_state || undefined,
      postal_code: payer.kyc_address_post_code || undefined,
      country,
    },
    nationalities: country ? [String(country).toUpperCase()] : undefined,
  }
}

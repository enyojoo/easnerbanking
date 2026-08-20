import { NextResponse } from "next/server"
import { fetchNoahCustomerForScope } from "@/lib/noah/fetch-customer"
import {
  formatNoahSignatureHelpError,
  isNoahSignatureErrorMessage,
  noahFetch,
} from "@/lib/noah/http"
import { buildHostedOnboardingBody } from "@/lib/noah/hosted-onboarding"
import { mapNoahCustomerToMobileSummary, mapNoahVerificationToKycStatus } from "@/lib/noah/map-kyc"
import { syncNoahCustomerToSupabase } from "@/lib/noah/sync-user"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { evaluateKycLinksPreflight } from "@/lib/noah/kyc-links-preflight"
import { requireAuth, requireNoahEnv, resolveNoahContextAsync } from "../_helpers"

/**
 * Start or resume Noah hosted onboarding (Standard Model).
 * One `HostedURL` covers identity verification (KYC/KYB) and partner Terms & Conditions – no separate TOS API.
 * @see https://docs.noah.com/recipes/onboarding/hosted-onboarding/
 */
export async function POST(request: Request) {
  const mis = requireNoahEnv()
  if (mis) return mis
  const auth = await requireAuth(request)
  if ("error" in auth) return auth.error
  const { user } = auth

  let body: { full_name?: string; email?: string; type?: string; residenceCountry?: string } = {}
  try {
    body = await request.json()
  } catch {
    /* empty */
  }

  const ctx = await resolveNoahContextAsync(user.id, request, body.type)
  if (!ctx.ok) return ctx.response

  const admin = createSupabaseAdmin()
  const preflight = await evaluateKycLinksPreflight({
    admin,
    scope: ctx.scope,
    userId: user.id,
    businessId: ctx.businessId,
    residenceCountryFromBody: body.residenceCountry,
  })
  if (preflight.action === "respond") {
    return preflight.response
  }
  if (preflight.action === "skipHostedPost") {
    const subjectId = ctx.scope === "business" ? (ctx.businessId ?? ctx.noahCustomerId) : user.id
    const { customer, resolvedCustomerId } = await fetchNoahCustomerForScope(
      ctx.scope,
      subjectId,
      ctx.noahCustomerId,
    )
    await syncNoahCustomerToSupabase(
      ctx.scope === "business" && ctx.businessId
        ? { kind: "business", businessId: ctx.businessId }
        : { kind: "individual", userId: user.id },
      customer,
      resolvedCustomerId,
    )
    const summary = mapNoahCustomerToMobileSummary(customer, resolvedCustomerId)
    const kycStatus = mapNoahVerificationToKycStatus(customer)
    return NextResponse.json({
      kyc_link: null,
      kyc_status: kycStatus || preflight.kycStatus || "pending",
      customer_id: resolvedCustomerId,
      kyc_link_id: resolvedCustomerId,
      noahScope: ctx.scope,
      hostedCustomerType: ctx.customerType,
      alreadyOnboarded: true,
      hostedIncludesTerms: true,
      ...summary,
    })
  }

  try {
    const session =
      (await noahFetch<Record<string, unknown> | null>({
        method: "POST",
        path: `/onboarding/${encodeURIComponent(ctx.noahCustomerId)}`,
        json: buildHostedOnboardingBody({
          scope: ctx.scope,
          customerType: ctx.customerType,
          metadata: {
            easner_user_id: user.id,
            ...(ctx.businessId ? { easner_business_id: ctx.businessId } : {}),
            full_name: body.full_name || "",
            email: body.email || user.email || "",
            easner_product: ctx.scope === "business" ? "easner_business" : "easner_mobile",
          },
        }),
      })) ?? {}

    const hostedUrl = typeof session.HostedURL === "string" ? session.HostedURL.trim() : ""
    if (hostedUrl) {
      const kycStatus =
        typeof session.OnboardingStatus === "string"
          ? String(session.OnboardingStatus).toLowerCase()
          : "not_started"
      return NextResponse.json({
        kyc_link: hostedUrl,
        kyc_status: kycStatus || "not_started",
        customer_id: ctx.noahCustomerId,
        kyc_link_id: ctx.noahCustomerId,
        noahScope: ctx.scope,
        hostedCustomerType: ctx.customerType,
        onboardingStatus: session.OnboardingStatus ?? null,
        missingSteps: session.MissingSteps ?? null,
        canResubmit: true,
        hostedIncludesTerms: true,
      })
    }

    const subjectId = ctx.scope === "business" ? (ctx.businessId ?? ctx.noahCustomerId) : user.id
    const { customer, resolvedCustomerId } = await fetchNoahCustomerForScope(
      ctx.scope,
      subjectId,
      ctx.noahCustomerId,
    )

    await syncNoahCustomerToSupabase(
      ctx.scope === "business" && ctx.businessId
        ? { kind: "business", businessId: ctx.businessId }
        : { kind: "individual", userId: user.id },
      customer,
      resolvedCustomerId,
    )

    const summary = mapNoahCustomerToMobileSummary(customer, resolvedCustomerId)
    const kycStatus = mapNoahVerificationToKycStatus(customer)

    return NextResponse.json({
      kyc_link: null,
      kyc_status: kycStatus,
      customer_id: resolvedCustomerId,
      kyc_link_id: resolvedCustomerId,
      noahScope: ctx.scope,
      hostedCustomerType: ctx.customerType,
      onboardingStatus: session.OnboardingStatus ?? null,
      alreadyOnboarded: true,
      hostedIncludesTerms: true,
      ...summary,
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    if (isNoahSignatureErrorMessage(msg)) {
      return NextResponse.json(
        { error: formatNoahSignatureHelpError(msg), code: "NOAH_SIGNATURE_INVALID" },
        { status: 400 },
      )
    }
    if (e instanceof TypeError || e instanceof RangeError || e instanceof ReferenceError) {
      console.error("[noah/kyc-links] unexpected error starting onboarding:", e)
      return NextResponse.json(
        {
          error:
            "We couldn't start verification right now. Please try again in a moment, or contact support if this keeps happening.",
        },
        { status: 500 },
      )
    }
    return NextResponse.json({ error: msg }, { status: 400 })
  }
}

import { NextResponse } from "next/server"
import { fetchNoahCustomerWithIndividualFallback } from "@/lib/noah/fetch-customer"
import {
  formatNoahSignatureHelpError,
  isNoahSignatureErrorMessage,
  noahFetch,
} from "@/lib/noah/http"
import { buildHostedOnboardingBody } from "@/lib/noah/hosted-onboarding"
import { mapNoahCustomerToMobileSummary, mapNoahVerificationToKycStatus } from "@/lib/noah/map-kyc"
import { syncNoahCustomerToSupabase } from "@/lib/noah/sync-user"
import { requireAuth, requireNoahEnv, resolveNoahContextAsync } from "../_helpers"

/**
 * Start or resume Noah hosted onboarding (KYC individual / KYB business).
 * Returns `kyc_link` = Noah `HostedURL` when a session is required (HTTP 200).
 * On 201/202 Noah may omit `HostedURL` — sync customer and return status instead.
 */
export async function POST(request: Request) {
  const mis = requireNoahEnv()
  if (mis) return mis
  const auth = await requireAuth(request)
  if ("error" in auth) return auth.error
  const { user } = auth

  let body: { full_name?: string; email?: string; type?: string } = {}
  try {
    body = await request.json()
  } catch {
    /* empty */
  }

  const ctx = await resolveNoahContextAsync(user.id, request, body.type)
  if (!ctx.ok) return ctx.response

  try {
    const session = await noahFetch<Record<string, unknown>>({
      method: "POST",
      path: `/onboarding/${encodeURIComponent(ctx.noahCustomerId)}`,
      json: buildHostedOnboardingBody({
        scope: ctx.scope,
        customerType: ctx.customerType,
        metadata: {
          easner_user_id: user.id,
          full_name: body.full_name || "",
          email: body.email || user.email || "",
          easner_product: ctx.scope === "business" ? "easner_business" : "easner_mobile",
        },
      }),
    })

    const hostedUrl = typeof session.HostedURL === "string" ? session.HostedURL.trim() : ""
    if (hostedUrl) {
      const kycStatus =
        typeof session.OnboardingStatus === "string"
          ? String(session.OnboardingStatus).toLowerCase()
          : "not_started"
      return NextResponse.json({
        kyc_link: hostedUrl,
        tos_link: hostedUrl,
        kyc_status: kycStatus || "not_started",
        tos_status: "pending",
        customer_id: ctx.noahCustomerId,
        kyc_link_id: ctx.noahCustomerId,
        noahScope: ctx.scope,
        hostedCustomerType: ctx.customerType,
        onboardingStatus: session.OnboardingStatus ?? null,
        missingSteps: session.MissingSteps ?? null,
      })
    }

    const { customer, resolvedCustomerId } =
      ctx.scope === "individual"
        ? await fetchNoahCustomerWithIndividualFallback(user.id, ctx.noahCustomerId)
        : {
            customer: await noahFetch<Record<string, unknown>>({
              method: "GET",
              path: `/customers/${encodeURIComponent(ctx.noahCustomerId)}`,
            }),
            resolvedCustomerId: ctx.noahCustomerId,
          }

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
      tos_link: null,
      kyc_status: kycStatus,
      tos_status: kycStatus === "approved" ? "signed" : "pending",
      customer_id: resolvedCustomerId,
      kyc_link_id: resolvedCustomerId,
      noahScope: ctx.scope,
      hostedCustomerType: ctx.customerType,
      onboardingStatus: session.OnboardingStatus ?? null,
      alreadyOnboarded: true,
      ...summary,
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    const friendly = isNoahSignatureErrorMessage(msg) ? formatNoahSignatureHelpError(msg) : msg
    return NextResponse.json(
      { error: friendly, code: isNoahSignatureErrorMessage(msg) ? "NOAH_SIGNATURE_INVALID" : undefined },
      { status: 400 },
    )
  }
}

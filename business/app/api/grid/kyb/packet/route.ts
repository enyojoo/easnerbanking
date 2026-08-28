import { NextResponse } from "next/server"
import {
  mapGridKybVerificationErrors,
  mergeGridKybCompanyDraft,
  withRequiredKybOwnerRoles,
  type GridKybCompanyDraft,
} from "@easner/shared"
import { requireKybContext } from "../_context"
import {
  ensureKybApplication,
  linkKybPeopleToGridOwnerErrors,
  listKybDocuments,
  listKybPeople,
} from "@/lib/grid/kyb-application-store"
import { ensureGridBusinessCustomer, loadGridBusinessProfile } from "@/lib/grid/ensure-grid-business-customer"

function prefillCompanyFromProfile(
  company: GridKybCompanyDraft,
  profile: {
    legalName?: string | null
    registrationNumber?: string | null
    taxId?: string | null
    country?: string | null
    addressLine1?: string | null
    city?: string | null
    state?: string | null
    postalCode?: string | null
  } | null,
) {
  if (!profile) return company
  const country = String(profile.country ?? "").trim().toUpperCase()
  return mergeGridKybCompanyDraft(
    company,
    {
      legalName: String(profile.legalName ?? "").trim(),
      registrationNumber: String(profile.registrationNumber ?? "").trim(),
      taxId: String(profile.taxId ?? "").trim(),
      country,
      addressCountry: country,
      addressLine1: String(profile.addressLine1 ?? "").trim(),
      city: String(profile.city ?? "").trim(),
      state: String(profile.state ?? "").trim(),
      postalCode: String(profile.postalCode ?? "").trim(),
    },
    "fill-empty",
  )
}

export async function GET(request: Request) {
  const ctx = await requireKybContext(request)
  if ("error" in ctx) return ctx.error

  const application = await ensureKybApplication(ctx.admin, ctx.businessId)
  let people: Awaited<ReturnType<typeof listKybPeople>> = []
  let documents: Awaited<ReturnType<typeof listKybDocuments>> = []
  const [profile] = await Promise.all([
    loadGridBusinessProfile(ctx.admin, ctx.businessId),
    listKybPeople(ctx.admin, application.id, true)
      .then((rows) => {
        people = rows
      })
      .catch((error) => {
        console.warn("[grid/kyb/packet] list people:", error)
      }),
    listKybDocuments(ctx.admin, application.id, true)
      .then((rows) => {
        documents = rows
      })
      .catch((error) => {
        console.warn("[grid/kyb/packet] list documents:", error)
      }),
  ])
  people = await linkKybPeopleToGridOwnerErrors(ctx.admin, people, application.last_errors)
  const peopleWithRoles = withRequiredKybOwnerRoles(people)
  if (peopleWithRoles[0] && peopleWithRoles[0].roles !== people[0]?.roles) {
    await ctx.admin
      .from("business_kyb_people")
      .update({ roles: peopleWithRoles[0].roles, updated_at: new Date().toISOString() })
      .eq("id", peopleWithRoles[0].id)
      .eq("application_id", application.id)
    people = peopleWithRoles
  }
  const company = prefillCompanyFromProfile(application.company, profile)
  if (JSON.stringify(application.company) !== JSON.stringify(company)) {
    await ctx.admin
      .from("business_kyb_applications")
      .update({ company, updated_at: new Date().toISOString() })
      .eq("id", application.id)
  }

  if (profile && !application.grid_customer_id) {
    try {
      const ensured = await ensureGridBusinessCustomer({
        admin: ctx.admin,
        userId: ctx.userId,
        businessId: ctx.businessId,
        profile,
      })
      if (ensured.customerId && ensured.customerId !== application.grid_customer_id) {
        await ctx.admin
          .from("business_kyb_applications")
          .update({
            grid_customer_id: ensured.customerId,
            updated_at: new Date().toISOString(),
          })
          .eq("id", application.id)
        application.grid_customer_id = ensured.customerId
      }
    } catch (error) {
      console.warn("[grid/kyb/packet] ensure customer:", error)
    }
  }

  return NextResponse.json({
    applicationId: application.id,
    status: application.status,
    company,
    people,
    documents: documents.map((doc) => ({
      ...doc,
      storagePath: undefined,
    })),
    errors: application.last_errors,
    errorPointers: mapGridKybVerificationErrors(application.last_errors, documents),
    gridCustomerId: application.grid_customer_id,
    submittedAt: application.submitted_at,
  })
}

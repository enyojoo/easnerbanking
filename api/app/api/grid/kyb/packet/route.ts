import { NextResponse } from "next/server"
import {
  mapGridKybVerificationErrors,
  mergeGridKybCompanyDraft,
  withRequiredKybOwnerRoles,
  type GridKybCompanyDraft,
} from "@easner/shared"
import { requireKybContext } from "../_context"
import { resolveOrgOwnerUserId } from "@/lib/business/org-owner"
import {
  ensureKybApplication,
  linkKybPeopleToGridOwnerErrors,
  listKybDocuments,
  listKybPeople,
  mapKybPersonRow,
  personWritePayload,
} from "@/lib/grid/kyb-application-store"
import { ensureGridBusinessCustomer, loadGridBusinessProfile } from "@/lib/grid/ensure-grid-business-customer"
import {
  emptyKybOwnerFromPersonal,
  kybPersonNeedsPersonalPrefill,
  mergeKybPersonFromPersonal,
  personalOwnerPrefillFromUserRow,
} from "@/lib/grid/prefill-kyb-owner-from-personal"

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
  try {
    const ownerUserId = await resolveOrgOwnerUserId(ctx.admin, ctx.businessId, ctx.userId)
    const { data: ownerRow } = await ctx.admin
      .from("users")
      .select(
        "full_name,email,phone,date_of_birth,residence_country,kyc_address_street,kyc_address_city,kyc_address_state,kyc_address_post_code,kyc_address_country,kyc_id_type,kyc_id_number,kyc_id_issuing_country",
      )
      .eq("id", ownerUserId)
      .maybeSingle()
    const personal = personalOwnerPrefillFromUserRow(ownerRow as Record<string, unknown> | null)
    if (personal.fullName || personal.email) {
      if (people.length === 0) {
        const seeded = emptyKybOwnerFromPersonal(personal)
        if (seeded.firstName && seeded.lastName) {
          const { data: created } = await ctx.admin
            .from("business_kyb_people")
            .insert(personWritePayload({ applicationId: application.id, businessId: ctx.businessId, person: seeded }))
            .select("*")
            .single()
          if (created) people = [mapKybPersonRow(created as Record<string, unknown>, true)]
        }
      } else {
        const person = people[0]
        const merged = mergeKybPersonFromPersonal(person, personal)
        if (kybPersonNeedsPersonalPrefill(person, merged)) {
          const { data: updated } = await ctx.admin
            .from("business_kyb_people")
            .update(
              personWritePayload({
                applicationId: application.id,
                businessId: ctx.businessId,
                person: { ...person, ...merged },
              }),
            )
            .eq("id", person.id)
            .eq("application_id", application.id)
            .select("*")
            .single()
          if (updated) people = [mapKybPersonRow(updated as Record<string, unknown>, true), ...people.slice(1)]
        }
      }
    }
  } catch (error) {
    console.warn("[grid/kyb/packet] prefill owner from personal settings:", error)
  }
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

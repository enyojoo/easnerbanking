import { NextResponse } from "next/server"
import {
  gridBeneficialOwnerIdFromResource,
  gridDocumentIdFromResource,
  gridKybApplicationStatusFromVerification,
  gridKybOwnerIdTypeForGrid,
  allocateGridKybOwnershipPercentagesForGrid,
  hasReadyKybIdentityDocuments,
  withFirstKybOwnerUbo,
  mapGridKybVerificationErrors,
  rejectedGridDocumentIdsFromErrors,
  type GridKybVerificationError,
} from "@easner/shared"
import { requireKybContext } from "../_context"
import {
  ensureKybApplication,
  KYB_DOCUMENTS_BUCKET,
  listKybDocuments,
  listKybPeople,
  type KybApplicationRow,
  type KybDocumentRow,
  type KybPersonRow,
} from "@/lib/grid/kyb-application-store"
import {
  ensureGridBusinessCustomer,
  loadGridBusinessProfile,
  resolveGridBusinessKybContact,
} from "@/lib/grid/ensure-grid-business-customer"
import {
  patchGridBusinessKybCustomer,
  submitGridKybVerification,
  deleteGridKybDocument,
  uploadGridKybDocument,
  upsertGridBeneficialOwner,
} from "@/lib/grid/kyb-grid-writes"
import { persistVerificationStatus } from "@/lib/compliance/verification-store"
import { syncGridBusinessKybToSupabase } from "@/lib/grid/sync-kyb"
import { formatHostedKybStartError } from "@/lib/grid/format-grid-api-error"

function companyNeedsGridSync(
  application: KybApplicationRow,
  errors: GridKybVerificationError[],
): boolean {
  if (!application.last_synced_at) return true
  if (application.updated_at && application.updated_at > application.last_synced_at) return true
  return errors.some((error) => {
    const resourceId = String(error.resourceId ?? "").trim()
    const field = String(error.field ?? "").trim()
    if (resourceId.startsWith("BeneficialOwner:") || resourceId.startsWith("Document:")) return false
    if (field.startsWith("businessInfo") || field.startsWith("address") || field === "email") return true
    return resourceId.startsWith("Customer:") || (!resourceId && Boolean(field))
  })
}

function peopleNeedingGridSync(
  people: KybPersonRow[],
  documents: KybDocumentRow[],
  errors: GridKybVerificationError[],
  lastSyncedAt: string | null,
): KybPersonRow[] {
  const rejectedDocIds = new Set(rejectedGridDocumentIdsFromErrors(errors))
  const ownerIdsFromErrors = new Set<string>()
  for (const error of errors) {
    const resourceId = String(error.resourceId ?? "").trim()
    if (!resourceId.startsWith("BeneficialOwner:")) continue
    const ownerId = gridBeneficialOwnerIdFromResource(resourceId)
    if (ownerId) ownerIdsFromErrors.add(ownerId)
  }

  return people.filter((person) => {
    if (!person.gridBeneficialOwnerId) return true
    const gridOwnerId = gridBeneficialOwnerIdFromResource(person.gridBeneficialOwnerId)
    if (gridOwnerId && ownerIdsFromErrors.has(gridOwnerId)) return true
    if (
      documents.some(
        (document) =>
          document.personId === person.id &&
          rejectedDocIds.has(gridDocumentIdFromResource(document.gridDocumentId)),
      )
    ) {
      return true
    }
    if (lastSyncedAt && person.updatedAt && person.updatedAt > lastSyncedAt) return true
    return false
  })
}

function documentsNeedingGridSync(
  documents: KybDocumentRow[],
  errors: GridKybVerificationError[],
  lastSyncedAt: string | null,
): KybDocumentRow[] {
  const rejectedIds = new Set(rejectedGridDocumentIdsFromErrors(errors))
  return documents.filter((document) => {
    const existingGridId = gridDocumentIdFromResource(document.gridDocumentId)
    if (!existingGridId) return true
    if (rejectedIds.has(existingGridId)) return true
    if (lastSyncedAt && document.updatedAt && document.updatedAt > lastSyncedAt) return true
    return false
  })
}

export async function POST(request: Request) {
  const ctx = await requireKybContext(request)
  if ("error" in ctx) return ctx.error

  const application = await ensureKybApplication(ctx.admin, ctx.businessId)
  const profile = await loadGridBusinessProfile(ctx.admin, ctx.businessId)
  if (!profile) {
    return NextResponse.json({ error: "Business organization not found" }, { status: 404 })
  }

  try {
    const ensured = await ensureGridBusinessCustomer({
      admin: ctx.admin,
      userId: ctx.userId,
      businessId: ctx.businessId,
      profile,
    })
    const customerId = ensured.customerId
    const contact = await resolveGridBusinessKybContact({
      admin: ctx.admin,
      businessId: ctx.businessId,
      userId: ctx.userId,
      supportEmail: profile.email,
    })
    const priorErrors = application.last_errors ?? []

    if (companyNeedsGridSync(application, priorErrors)) {
      await patchGridBusinessKybCustomer({
        customerId,
        company: application.company,
        email: contact.email,
      })
    }

    const listedPeople = await listKybPeople(ctx.admin, application.id, true)
    const people = withFirstKybOwnerUbo(listedPeople)
    const documents = await listKybDocuments(ctx.admin, application.id, true)
    const gridOwnershipPercentages = allocateGridKybOwnershipPercentagesForGrid(
      people.map((person) => person.ownershipPercentage),
    )
    if (people[0] && listedPeople[0] && people[0].roles !== listedPeople[0].roles) {
      const touchedAt = new Date().toISOString()
      await ctx.admin
        .from("business_kyb_people")
        .update({ roles: people[0].roles, updated_at: touchedAt })
        .eq("id", people[0].id)
        .eq("application_id", application.id)
      people[0].updatedAt = touchedAt
    }
    for (const person of people) {
      const idType = gridKybOwnerIdTypeForGrid(person)
      if (idType && idType !== person.idType) {
        const touchedAt = new Date().toISOString()
        person.idType = idType
        person.updatedAt = touchedAt
        await ctx.admin
          .from("business_kyb_people")
          .update({ id_type: idType, updated_at: touchedAt })
          .eq("id", person.id)
      }
    }

    if (!hasReadyKybIdentityDocuments(people, documents)) {
      return NextResponse.json(
        { error: "Add issuing country, issuing authority, and document number on each owner ID before submitting." },
        { status: 400 },
      )
    }

    const peopleToSync = peopleNeedingGridSync(
      people,
      documents,
      priorErrors,
      application.last_synced_at,
    )
    await Promise.all(
      peopleToSync.map(async (person) => {
        const index = people.findIndex((row) => row.id === person.id)
        const gridId = await upsertGridBeneficialOwner({
          customerId,
          person,
          ownershipPercentage: gridOwnershipPercentages[index] ?? 0,
        })
        if (gridId !== person.gridBeneficialOwnerId) {
          await ctx.admin
            .from("business_kyb_people")
            .update({ grid_beneficial_owner_id: gridId, updated_at: new Date().toISOString() })
            .eq("id", person.id)
          person.gridBeneficialOwnerId = gridId
        }
      }),
    )

    const documentsToSync = documentsNeedingGridSync(
      documents,
      priorErrors,
      application.last_synced_at,
    )
    await Promise.all(
      documentsToSync.map(async (document) => {
        const existingGridId = gridDocumentIdFromResource(document.gridDocumentId)
        const downloaded = await ctx.admin.storage.from(KYB_DOCUMENTS_BUCKET).download(document.storagePath)
        if (downloaded.error || !downloaded.data) {
          throw new Error("Could not read an uploaded document.")
        }
        const bytes = Buffer.from(await downloaded.data.arrayBuffer())
        const holder = document.personId
          ? people.find((person) => person.id === document.personId)?.gridBeneficialOwnerId
          : customerId
        if (!holder) {
          throw new Error("Upload owner details before their ID document.")
        }
        if (existingGridId) {
          await deleteGridKybDocument(existingGridId).catch((error) => {
            console.warn("[grid/kyb/complete] Grid delete:", error)
          })
        }
        const gridDocumentId = await uploadGridKybDocument({
          documentHolder: holder,
          document,
          bytes,
          fileName: document.fileName,
        })
        await ctx.admin
          .from("business_kyb_documents")
          .update({ grid_document_id: gridDocumentId, updated_at: new Date().toISOString() })
          .eq("id", document.id)
        document.gridDocumentId = gridDocumentId
      }),
    )

    const verification = await submitGridKybVerification(customerId)
    const now = new Date().toISOString()
    const status = gridKybApplicationStatusFromVerification({
      verificationStatus: verification.verificationStatus,
    })
    await ctx.admin
      .from("business_kyb_applications")
      .update({
        status,
        grid_customer_id: customerId,
        grid_verification_id: verification.id || null,
        last_errors: verification.errors,
        submitted_at: now,
        last_synced_at: now,
        updated_at: now,
      })
      .eq("id", application.id)

    const synced = await syncGridBusinessKybToSupabase({
      admin: ctx.admin,
      businessId: ctx.businessId,
      userId: ctx.userId,
      customerId,
    })
    await persistVerificationStatus(ctx.admin, {
      kind: "business",
      businessId: ctx.businessId,
      userId: ctx.userId,
      provider: "grid",
      status: synced.status,
      gridCustomerId: customerId,
    })

    return NextResponse.json({
      status,
      localStatus: synced.status,
      errors: verification.errors,
      errorPointers: mapGridKybVerificationErrors(verification.errors, documents),
      gridCustomerId: customerId,
      verificationId: verification.id,
    })
  } catch (error) {
    return NextResponse.json(
      { error: formatHostedKybStartError(error) },
      { status: 400 },
    )
  }
}

import { NextResponse } from "next/server"
import {
  gridDocumentIdFromResource,
  gridKybApplicationStatusFromVerification,
  gridKybOwnerIdTypeForGrid,
  hasReadyKybIdentityDocuments,
  mapGridKybVerificationErrors,
  rejectedGridDocumentIdsFromErrors,
} from "@easner/shared"
import { requireKybContext } from "../_context"
import {
  ensureKybApplication,
  KYB_DOCUMENTS_BUCKET,
  listKybDocuments,
  listKybPeople,
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
    await patchGridBusinessKybCustomer({
      customerId,
      company: application.company,
      email: contact.email,
    })

    const people = await listKybPeople(ctx.admin, application.id, true)
    for (const person of people) {
      const idType = gridKybOwnerIdTypeForGrid(person)
      if (idType && idType !== person.idType) {
        person.idType = idType
        await ctx.admin
          .from("business_kyb_people")
          .update({ id_type: idType, updated_at: new Date().toISOString() })
          .eq("id", person.id)
      }
      const gridId = await upsertGridBeneficialOwner({ customerId, person })
      if (gridId !== person.gridBeneficialOwnerId) {
        await ctx.admin
          .from("business_kyb_people")
          .update({ grid_beneficial_owner_id: gridId, updated_at: new Date().toISOString() })
          .eq("id", person.id)
        person.gridBeneficialOwnerId = gridId
      }
    }

    const documents = await listKybDocuments(ctx.admin, application.id, true)
    if (!hasReadyKybIdentityDocuments(people, documents)) {
      return NextResponse.json(
        { error: "Add issuing country and document number on each owner ID before submitting." },
        { status: 400 },
      )
    }
    const rejectedIds = new Set(rejectedGridDocumentIdsFromErrors(application.last_errors))
    for (const document of documents) {
      const existingGridId = gridDocumentIdFromResource(document.gridDocumentId)
      const rejected = Boolean(existingGridId && rejectedIds.has(existingGridId))
      if (existingGridId && !rejected) continue
      const downloaded = await ctx.admin.storage.from(KYB_DOCUMENTS_BUCKET).download(document.storagePath)
      if (downloaded.error || !downloaded.data) {
        return NextResponse.json({ error: "Could not read an uploaded document." }, { status: 400 })
      }
      const bytes = Buffer.from(await downloaded.data.arrayBuffer())
      const holder = document.personId
        ? people.find((person) => person.id === document.personId)?.gridBeneficialOwnerId
        : customerId
      if (!holder) {
        return NextResponse.json({ error: "Upload owner details before their ID document." }, { status: 400 })
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
    }

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

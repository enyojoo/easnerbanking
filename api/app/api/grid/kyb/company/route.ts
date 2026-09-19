import { NextResponse } from "next/server"
import { emptyGridKybCompanyDraft, type GridKybCompanyDraft } from "@easner/shared"
import { requireKybContext } from "../_context"
import { ensureKybApplication } from "@/lib/grid/kyb-application-store"
import { patchGridBusinessKybCustomer } from "@/lib/grid/kyb-grid-writes"

function mergeCompany(raw: unknown): GridKybCompanyDraft {
  const base = emptyGridKybCompanyDraft()
  if (!raw || typeof raw !== "object") return base
  const body = raw as Record<string, unknown>
  return {
    ...base,
    ...Object.fromEntries(
      Object.entries(base).map(([key, fallback]) => {
        const next = body[key]
        if (Array.isArray(fallback)) {
          return [key, Array.isArray(next) ? next.map((row) => String(row)) : fallback]
        }
        return [key, next == null ? fallback : String(next)]
      }),
    ),
  } as GridKybCompanyDraft
}

export async function PATCH(request: Request) {
  const ctx = await requireKybContext(request)
  if ("error" in ctx) return ctx.error

  const application = await ensureKybApplication(ctx.admin, ctx.businessId)
  const company = mergeCompany(await request.json().catch(() => ({})))
  const now = new Date().toISOString()

  await ctx.admin
    .from("business_kyb_applications")
    .update({ company, updated_at: now })
    .eq("id", application.id)

  const publicPatch: Record<string, unknown> = { updated_at: now }
  if (company.legalName.trim()) publicPatch.name = company.legalName.trim()
  if (company.registrationNumber.trim()) publicPatch.registration_number = company.registrationNumber.trim()
  if (company.taxId.trim()) publicPatch.tax_id = company.taxId.trim()
  if (company.country.trim()) publicPatch.registration_country = company.country.trim().toUpperCase()
  if (company.addressLine1.trim()) publicPatch.registered_address_line1 = company.addressLine1.trim()
  if (company.city.trim()) publicPatch.registered_address_city = company.city.trim()
  if (company.state.trim()) publicPatch.registered_address_state = company.state.trim()
  if (company.postalCode.trim()) publicPatch.registered_address_postal_code = company.postalCode.trim()
  await ctx.admin.from("businesses").update(publicPatch).eq("id", ctx.businessId)

  const customerId = application.grid_customer_id
  if (customerId) {
    try {
      await patchGridBusinessKybCustomer({ customerId, company })
    } catch (error) {
      console.warn("[grid/kyb/company] Grid patch:", error)
    }
  }

  return NextResponse.json({ company })
}

import { noahCustomerIdFromUserId, type NoahCustomerScope } from "./customer-id"

/**
 * Resolve Noah customer id + API `CustomerType` for this request.
 * - Default: **individual** (mobile KYC) — `eind_{userId}` (compact UUID hex).
 * - **business** (KYB): header `X-Easner-Noah-Scope: business`, query `?noahScope=business`, or JSON `type: "business"`.
 */
export function resolveNoahContext(
  userId: string,
  request: Request,
  bodyTypeHint?: string,
): {
  scope: NoahCustomerScope
  customerType: "Individual" | "Business"
  noahCustomerId: string
} {
  const headers = request.headers
  const url = new URL(request.url)
  const headerScope = headers.get("x-easner-noah-scope")?.toLowerCase()
  const queryScope = url.searchParams.get("noahScope")?.toLowerCase()
  const hint = bodyTypeHint?.toLowerCase()

  let scope: NoahCustomerScope = "individual"
  if (headerScope === "business" || queryScope === "business" || hint === "business") {
    scope = "business"
  }

  const customerType = scope === "business" ? "Business" : "Individual"
  const noahCustomerId = noahCustomerIdFromUserId(userId, scope)
  return { scope, customerType, noahCustomerId }
}

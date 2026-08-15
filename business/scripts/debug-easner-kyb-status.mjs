import { gridFetch } from "../lib/grid/http.ts"
import { resolveGridBusinessKybLocalStatus } from "../lib/grid/resolve-grid-business-kyb-status.ts"

const customerId = "Customer:019ff8a6-443d-938e-0000-f6f502845e5b"
const customer = await gridFetch({
  method: "GET",
  path: `/customers/${encodeURIComponent(customerId)}`,
})
const verifications = await gridFetch({
  method: "GET",
  path: `/verifications?customerId=${encodeURIComponent(customerId)}&limit=20`,
}).catch(() => ({ data: [] }))

const resolved = resolveGridBusinessKybLocalStatus({
  customer,
  verifications: verifications.data ?? [],
})

console.log(
  JSON.stringify(
    {
      kybStatus: customer.kybStatus,
      beneficialOwners: customer.beneficialOwners,
      verifications: verifications.data,
      resolvedLocalStatus: resolved,
    },
    null,
    2,
  ),
)

export type ExplorerEndpoint = {
  id: string
  method: "GET" | "POST"
  path: string
  capability: string
  description: string
  sampleBody?: Record<string, unknown>
}

/**
 * Hand-authored starter catalog for the API Explorer — the most-used `/v1`
 * endpoints that take no path parameters, so "pick one and send it" works
 * with zero setup. Grow this list as the Explorer proves useful; endpoints
 * needing a path param (e.g. `/accounts/{id}`) are a natural next step once
 * this ships.
 */
export const EXPLORER_ENDPOINTS: ExplorerEndpoint[] = [
  {
    id: "customers.list",
    method: "GET",
    path: "/v1/customers",
    capability: "Customers",
    description: "List customers",
  },
  {
    id: "customers.create",
    method: "POST",
    path: "/v1/customers",
    capability: "Customers",
    description: "Create a customer",
    sampleBody: { email: "customer@example.com", name: "Sample Customer" },
  },
  {
    id: "accounts.list",
    method: "GET",
    path: "/v1/accounts",
    capability: "Accounts",
    description: "List accounts",
  },
  {
    id: "accounts.create",
    method: "POST",
    path: "/v1/accounts",
    capability: "Accounts",
    description: "Open an account for a customer",
    sampleBody: { currency: "USD", customer: "cus_..." },
  },
  {
    id: "transfers.list",
    method: "GET",
    path: "/v1/transfers",
    capability: "Transfers",
    description: "List transfers",
  },
  {
    id: "quotes.create",
    method: "POST",
    path: "/v1/quotes",
    capability: "Transfers",
    description: "Quote a transfer",
    sampleBody: { amount: 2500, currency: "USD", source: "acct_..." },
  },
  {
    id: "transactions.list",
    method: "GET",
    path: "/v1/transactions",
    capability: "Transactions",
    description: "List transactions",
  },
  {
    id: "payment_methods.list",
    method: "GET",
    path: "/v1/payment_methods",
    capability: "Transfers",
    description: "List supported corridors and rails",
  },
]

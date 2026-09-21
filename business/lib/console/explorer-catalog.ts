export type ExplorerEndpoint = {
  id: string
  method: "GET" | "POST"
  path: string
  capability: string
  description: string
  sampleBody?: Record<string, unknown>
  scope: "checkout" | "accounts.read" | "accounts.write" | "transfers.write"
}

export const EXPLORER_ENDPOINTS: ExplorerEndpoint[] = [
  {
    id: "customers.list",
    method: "GET",
    path: "/v1/customers",
    capability: "Customers",
    description: "List customers",
    scope: "accounts.read",
  },
  {
    id: "customers.retrieve",
    method: "GET",
    path: "/v1/customers/{id}",
    capability: "Customers",
    description: "Retrieve a customer",
    sampleBody: { id: "cus_..." },
    scope: "accounts.read",
  },
  {
    id: "customers.create",
    method: "POST",
    path: "/v1/customers",
    capability: "Customers",
    description: "Create a customer",
    sampleBody: { email: "customer@example.com", name: "Sample Customer" },
    scope: "transfers.write",
  },
  {
    id: "accounts.list",
    method: "GET",
    path: "/v1/accounts",
    capability: "Accounts",
    description: "List accounts",
    scope: "accounts.read",
  },
  {
    id: "accounts.retrieve",
    method: "GET",
    path: "/v1/accounts/{id}",
    capability: "Accounts",
    description: "Retrieve an account",
    sampleBody: { id: "acct_..." },
    scope: "accounts.read",
  },
  {
    id: "accounts.create",
    method: "POST",
    path: "/v1/accounts",
    capability: "Accounts",
    description: "Open an account for a customer",
    sampleBody: { currency: "USD", customer: "cus_..." },
    scope: "accounts.write",
  },
  {
    id: "transfers.list",
    method: "GET",
    path: "/v1/transfers",
    capability: "Transfers",
    description: "List transfers",
    scope: "accounts.read",
  },
  {
    id: "transfers.retrieve",
    method: "GET",
    path: "/v1/transfers/{id}",
    capability: "Transfers",
    description: "Retrieve a transfer",
    sampleBody: { id: "tr_..." },
    scope: "accounts.read",
  },
  {
    id: "quotes.create",
    method: "POST",
    path: "/v1/quotes",
    capability: "Transfers",
    description: "Quote a transfer",
    sampleBody: { amount: 2500, currency: "USD", source: "acct_..." },
    scope: "transfers.write",
  },
  {
    id: "transactions.list",
    method: "GET",
    path: "/v1/transactions",
    capability: "Transactions",
    description: "List transactions",
    scope: "accounts.read",
  },
  {
    id: "transactions.retrieve",
    method: "GET",
    path: "/v1/transactions/{id}",
    capability: "Transactions",
    description: "Retrieve a transaction",
    sampleBody: { id: "txn_..." },
    scope: "accounts.read",
  },
  {
    id: "payment_methods.list",
    method: "GET",
    path: "/v1/payment_methods",
    capability: "Transfers",
    description: "List supported corridors and rails",
    scope: "accounts.read",
  },
]

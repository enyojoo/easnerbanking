export type OfficeStatement = {
  id: string
  statement_id: string
  user_id: string
  business_id: string | null
  scope: "personal" | "business"
  currency: "USD" | "EUR"
  period_from: string
  period_to: string
  available_as_of: string
  time_zone: string
  holder_name: string
  holder_email: string
  available_balance: number
  storage_path: string
  created_at: string
}

export type OfficeStatementsPage = {
  statements: OfficeStatement[]
  nextCursor: string | null
}

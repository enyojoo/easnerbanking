export type StatementCurrency = "USD" | "EUR"
export type StatementScope = "personal" | "business"

export type StatementBankFields = {
  accountNumber?: string
  routingNumber?: string
  iban?: string
  bic?: string
  bankName?: string
  bankAddress?: string
}

export type StatementActivityPdfRow = {
  date: string
  type: string
  details: string
  moneyIn: string
  moneyOut: string
}

export type AssembledStatement = {
  statementId: string
  scope: StatementScope
  currency: StatementCurrency
  timeZone: string
  periodFrom: string
  periodTo: string
  periodLabel: string
  availableAsOf: string
  availableAsOfLabel: string
  holderName: string
  holderEmail: string
  holderFirstName: string | null
  addressLabel: "Residential Address" | "Business Address"
  address: string
  bank: StatementBankFields | null
  opening: number
  moneyIn: number
  moneyOut: number
  closing: number
  available: number
  openingLabel: string
  moneyInLabel: string
  moneyOutLabel: string
  closingLabel: string
  availableLabel: string
  lines: StatementActivityPdfRow[]
}

export type AssembleStatementInput = {
  userId: string
  businessId: string | null
  currency: StatementCurrency
  fromIso: string
  toIso: string
  timeZone?: string | null
  statementId: string
  now?: Date
}

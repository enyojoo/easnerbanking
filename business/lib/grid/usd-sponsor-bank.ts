/** Platform-wide USD sponsor bank for Grid business INTERNAL_FIAT accounts (Grid-confirmed). */
export const GRID_USD_SPONSOR_BANK = {
  bankName: "Cross River Bank",
  bankAddress: "885 Teaneck Road, Teaneck, NJ 07666, US",
  /** ACH routing number for Cross River (Grid USD receive). */
  routingNumber: "021214891",
  /** Stored in DB for ops/integrations; not shown in customer-facing UI (SWIFT unsupported). */
  bic: "CSRVUS33",
} as const

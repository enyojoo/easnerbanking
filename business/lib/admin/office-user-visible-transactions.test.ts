import { describe, expect, it, vi } from "vitest"

vi.mock("@/lib/noah/global-payout-ledger", () => ({
  collectGlobalPayoutSettlementTxHashesForScope: vi.fn(async () => new Set<string>()),
}))

vi.mock("@/lib/noah/noah-bank-onramp-chain-suppression", () => ({
  collectNoahBankOnrampOnChainTxHashesForScope: vi.fn(async () => new Set<string>()),
}))

vi.mock("@/lib/transactions/enrich-bank-deposit-ledger-rows", () => ({
  enrichBankDepositLedgerRows: vi.fn(async (_admin: unknown, rows: unknown[]) => rows),
}))

vi.mock("@/lib/admin/office-overview-compute", () => ({
  activityPrimaryLabel: (tx: { metadata?: Record<string, unknown> | null }) => {
    const tag = tx.metadata?.sender_easetag
    return typeof tag === "string" ? `Received from @${tag}` : "Bank Deposit"
  },
  formatOfficeTxAmount: () => "$25.00",
  resolveOfficeTxPresentation: () => ({
    displayAmount: 25,
    displayCurrency: "USD",
    balanceAmount: 25,
    balanceCurrency: "USD",
  }),
}))

import { filterUserVisibleOfficeLedgerRows, enrichOfficeLedgerForUserDisplay } from "./office-user-visible-transactions"

describe("filterUserVisibleOfficeLedgerRows", () => {
  it("drops suppress_in_feed orchestration legs", async () => {
    const admin = {} as never
    const rows = [
      {
        id: "visible",
        user_id: "u1",
        business_id: null,
        provider: "noah",
        direction: "in",
        status: "settled",
        metadata: { sender_name: "Acme" },
        created_at: new Date().toISOString(),
      },
      {
        id: "hidden",
        user_id: "u1",
        business_id: null,
        provider: "turnkey",
        direction: "in",
        status: "settled",
        metadata: { suppress_in_feed: true },
        created_at: new Date().toISOString(),
      },
    ]

    const visible = await filterUserVisibleOfficeLedgerRows(admin, rows)
    expect(visible.map((r) => r.id)).toEqual(["visible"])
  })
})

describe("enrichOfficeLedgerForUserDisplay", () => {
  it("labels easetag receive like user feed", () => {
    const enriched = enrichOfficeLedgerForUserDisplay({
      id: "e1",
      user_id: "u1",
      business_id: null,
      provider: "easner_internal",
      provider_transaction_id: "p1",
      provider_event_id: null,
      easner_transaction_id: null,
      status: "settled",
      amount: 25,
      currency: "USD",
      direction: "in",
      metadata: { source: "easetag_p2p", sender_easetag: "jane" },
      payload: null,
      created_at: new Date().toISOString(),
      updated_at: null,
      occurred_at: null,
      settled_at: null,
      tx_hash: null,
      wallet_address: null,
      asset: null,
      chain: null,
      counterparty_address: null,
      base_currency: "USD",
      base_amount: 25,
      fx_rate: null,
      fx_rate_as_of: null,
      user: null,
    })

    expect(enriched.label).toContain("@jane")
    expect(enriched.amountFormatted).toMatch(/^\$/)
  })
})

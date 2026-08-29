import { describe, expect, it } from "vitest"
import {
  displayEasnerTransactionIdForList,
  inferLedgerListSourceType,
  isSuccessfulFeedTransaction,
  mapLedgerRowToMobileListItem,
  resolveGlobalPayoutListDisplay,
  shouldIncludeRowInUserFeed,
} from "./map-ledger-list-row"

function baseRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "db-uuid-1",
    easner_transaction_id: null,
    provider: "noah",
    provider_transaction_id: "noah-tx-1",
    status: "settled",
    amount: 25,
    currency: "USD",
    direction: "in",
    metadata: null,
    created_at: "2025-01-15T12:00:00.000Z",
    occurred_at: "2025-01-15T12:00:00.000Z",
    hidden_from_feed: false,
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// displayEasnerTransactionIdForList
// ---------------------------------------------------------------------------

describe("displayEasnerTransactionIdForList", () => {
  it("prefers easner_transaction_id column", () => {
    expect(
      displayEasnerTransactionIdForList({
        easnerTransactionId: "ETID00001234",
        providerTransactionId: "noah-tx-1",
        fallbackId: "db-uuid",
      }),
    ).toBe("ETID00001234")
  })

  it("falls through to metadata etid", () => {
    expect(
      displayEasnerTransactionIdForList({
        easnerTransactionId: null,
        metadata: { easner_transaction_id: "ETID00009999" },
        providerTransactionId: "noah-tx-1",
      }),
    ).toBe("ETID00009999")
  })

  it("falls through to provider tx id if ETID prefixed", () => {
    expect(
      displayEasnerTransactionIdForList({
        easnerTransactionId: null,
        metadata: {},
        providerTransactionId: "ETIDabcde",
      }),
    ).toBe("ETIDabcde")
  })

  it("returns fallbackId (DB uuid) last resort", () => {
    expect(
      displayEasnerTransactionIdForList({
        easnerTransactionId: null,
        metadata: {},
        providerTransactionId: "noah-tx-1",
        fallbackId: "db-uuid",
      }),
    ).toBe("db-uuid")
  })
})

// ---------------------------------------------------------------------------
// inferLedgerListSourceType
// ---------------------------------------------------------------------------

describe("inferLedgerListSourceType", () => {
  it("returns easetag_p2p for easetag", () => {
    expect(inferLedgerListSourceType({ source: "easetag_p2p" })).toBe("easetag_p2p")
  })

  it("returns virtual_account for bank onramp", () => {
    expect(inferLedgerListSourceType({ flow: "bank_onramp" })).toBe("virtual_account")
  })

  it("returns liquidation_address for turnkey webhook", () => {
    expect(inferLedgerListSourceType({ source: "turnkey_webhook" })).toBe("liquidation_address")
  })

  it("returns undefined for unknown", () => {
    expect(inferLedgerListSourceType({})).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// shouldIncludeRowInUserFeed
// ---------------------------------------------------------------------------

describe("shouldIncludeRowInUserFeed", () => {
  it("returns true when hidden_from_feed is false", () => {
    expect(shouldIncludeRowInUserFeed({ hidden_from_feed: false })).toBe(true)
  })

  it("returns false when hidden_from_feed is true", () => {
    expect(shouldIncludeRowInUserFeed({ hidden_from_feed: true })).toBe(false)
  })

  it("returns true when field is absent", () => {
    expect(shouldIncludeRowInUserFeed({})).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// resolveGlobalPayoutListDisplay
// ---------------------------------------------------------------------------

describe("resolveGlobalPayoutListDisplay", () => {
  it("returns null for non-global-payout rows", () => {
    expect(resolveGlobalPayoutListDisplay(baseRow())).toBeNull()
  })

  it("returns display data from metadata for a payout row", () => {
    const row = baseRow({
      direction: "out",
      metadata: {
        payout_type: "global_fiat",
        receive_amount: 5000,
        requested_receive_amount: 4995,
        receive_currency: "NGN",
        beneficiary_name: "Jane Doe",
      },
    })
    const display = resolveGlobalPayoutListDisplay(row)
    expect(display).not.toBeNull()
    expect(display?.displayAmount).toBe(4995)
    expect(display?.displayCurrency).toBe("NGN")
    expect(display?.displayDescription).toBe("Jane Doe")
  })

  it("falls back to ledger amount when receive_amount absent", () => {
    const row = baseRow({
      direction: "out",
      amount: 25,
      currency: "USD",
      metadata: { payout_type: "global_fiat" },
    })
    const display = resolveGlobalPayoutListDisplay(row)
    expect(display?.displayAmount).toBe(25)
    expect(display?.displayCurrency).toBe("USD")
  })
})

// ---------------------------------------------------------------------------
// mapLedgerRowToMobileListItem
// ---------------------------------------------------------------------------

describe("mapLedgerRowToMobileListItem", () => {
  it("maps a basic settled inbound row", () => {
    const item = mapLedgerRowToMobileListItem(baseRow())
    expect(item.status).toBe("completed")
    expect(item.transaction_type).toBe("receive")
    expect(item.direction).toBe("credit")
    expect(item.amount).toBe(25)
    expect(item.ledger_row_id).toBe("db-uuid-1")
  })

  it("shows relay Tron gross sent as USD on the feed", () => {
    const item = mapLedgerRowToMobileListItem(
      baseRow({
        direction: "in",
        provider: "relay",
        amount: 2.31,
        currency: "USD",
        metadata: {
          activity_type: "relay_tron_deposit",
          gross_usdt: 3,
          posted_amount: 2.307509,
          posted_currency: "USD",
        },
      }),
    )
    expect(item.amount).toBe(3)
    expect(item.currency).toBe("USD")
    expect(item.display_amount).toBe(3)
    expect(item.display_currency).toBe("USD")
    expect(item.account_impact_amount).toBe(2.307509)
    expect(item.source_type).toBe("relay_tron_deposit")
  })

  it("shows Stripe collection gross on the feed, not net credit", () => {
    const item = mapLedgerRowToMobileListItem(
      baseRow({
        direction: "in",
        provider: "stripe",
        amount: 0.67,
        currency: "USD",
        metadata: {
          source: "checkout_stripe",
          headline: "Donations",
          gross_cents: 100,
          fee_cents: 33,
          net_cents: 67,
        },
      }),
    )
    expect(item.amount).toBe(1)
    expect(item.display_amount).toBe(1)
    expect(item.account_impact_amount).toBe(0.67)
    expect(item.display_hero_title).toBe("Donations")
  })

  it("produces sender_display_name from bank deposit metadata", () => {
    const item = mapLedgerRowToMobileListItem(
      baseRow({
        direction: "in",
        metadata: {
          flow: "bank_onramp",
          deposit_kind: "funding",
          sender_name: "Acme Corp",
          noah_fiat_deposit_sender_name: "Acme Corp",
        },
      }),
    )
    expect(item.sender_display_name).toBe("Acme Corp")
  })

  it("uses VERIFICATION_DEPOSIT_LIST_LABEL for verification rows", () => {
    const item = mapLedgerRowToMobileListItem(
      baseRow({
        direction: "in",
        amount: 0.1,
        metadata: { deposit_kind: "verification" },
      }),
    )
    expect(item.name).toBe("Bank verification deposit")
  })

  it("maps easetag receive with sender tag", () => {
    const item = mapLedgerRowToMobileListItem(
      baseRow({
        provider: "easner_internal",
        metadata: { source: "easetag_p2p", sender_easetag: "alice" },
      }),
    )
    expect(item.name).toContain("@alice")
    expect(item.source_type).toBe("easetag_p2p")
  })

  it("maps global payout display fields from metadata", () => {
    const item = mapLedgerRowToMobileListItem(
      baseRow({
        direction: "out",
        amount: 25,
        currency: "USD",
        metadata: {
          payout_type: "global_fiat",
          receive_amount: 5000,
          receive_currency: "NGN",
          beneficiary_name: "Jane Doe",
        },
      }),
    )
    expect(item.amount).toBe(5000)
    expect(item.currency).toBe("NGN")
    expect(item.ledger_amount).toBe(25)
    expect(item.ledger_currency).toBe("USD")
    expect(item.account_impact_amount).toBe(25)
    expect(item.account_impact_currency).toBe("USD")
    expect(item.display_description).toBe("Jane Doe")
    expect(item.display_hero_title).toBe("Jane Doe")
  })

  it("maps wallet send display fields from metadata", () => {
    const item = mapLedgerRowToMobileListItem(
      baseRow({
        direction: "out",
        amount: 1.01,
        currency: "USD",
        provider: "turnkey",
        metadata: {
          activity_type: "wallet_send",
          receive_amount: 1,
          receive_asset: "USDC",
          counterparty_name: "External Wallet",
          payout_review: {
            receive_amount: 1,
            receive_currency: "USDC",
            total_debited: 1.01,
            send_currency: "USD",
          },
        },
      }),
    )
    expect(item.amount).toBe(1)
    expect(item.currency).toBe("USD")
    expect(item.display_description).toBe("External Wallet")
    expect(item.transaction_product).toBe("Stablecoin Transfer")
    expect(item.ledger_amount).toBe(1.01)
    expect(item.ledger_currency).toBe("USD")
    expect(item.account_impact_amount).toBe(1.01)
    expect(item.account_impact_currency).toBe("USD")
    expect(item.display_hero_title).toBe("External Wallet")
  })

  it("maps YC fund_balance list name from deposit_display_title", () => {
    const item = mapLedgerRowToMobileListItem(
      baseRow({
        provider: "yellowcard",
        amount: 65,
        currency: "USD",
        metadata: {
          yc_mode: "fund_balance",
          flow: "bank_onramp",
          deposit_display_title: "Nigeria Bank Deposit",
          local_pay_in: 100000,
          local_currency: "NGN",
          usd_credit: 65,
        },
      }),
    )
    expect(item.name).toBe("Nigeria Bank Deposit")
    expect(item.amount).toBe(65)
    expect(item.currency).toBe("USD")
    expect(item.display_amount).toBe(65)
    expect(item.display_currency).toBe("USD")
    expect(item.account_impact_amount).toBe(65)
    expect(item.account_impact_currency).toBe("USD")
    expect(item.display_hero_title).toBe("Nigeria Bank Deposit")
    expect(item.transaction_product).toBe("Nigeria Bank Deposit")
  })

  it("presents the destination amount for a YC cross-border send", () => {
    const item = mapLedgerRowToMobileListItem(
      baseRow({
        provider: "yellowcard",
        amount: 100000,
        currency: "NGN",
        direction: "out",
        metadata: {
          yc_mode: "cross_border_send",
          receive_amount: 900,
          receive_currency: "GHS",
          reporting_usd_amount: 65,
          recipient_name: "Legacy Recipient",
          recipient_snapshot: { full_name: "Ama Mensah" },
        },
      }),
    )

    expect(item.amount).toBe(900)
    expect(item.currency).toBe("GHS")
    expect(item.display_amount).toBe(900)
    expect(item.display_currency).toBe("GHS")
    expect(item.account_impact_amount).toBe(65)
    expect(item.account_impact_currency).toBe("USD")
    expect(item.display_description).toBe("Ama Mensah")
    expect(item.display_hero_title).toBe("Ama Mensah")
  })

  it("exposes recipient_id from send metadata for the send hub", () => {
    const item = mapLedgerRowToMobileListItem(
      baseRow({
        direction: "out",
        metadata: {
          recipient_id: "rec-ke-1",
          destination_ref: "recipient:rec-ke-1",
          recipient_snapshot: { full_name: "Ama Mensah" },
        },
      }),
    )
    expect(item.recipient_id).toBe("rec-ke-1")
    expect(item.transaction_type).toBe("send")
  })
})

describe("isSuccessfulFeedTransaction", () => {
  it("counts settled and deposited ledger rows", () => {
    expect(isSuccessfulFeedTransaction(baseRow({ status: "settled" }))).toBe(true)
    expect(isSuccessfulFeedTransaction(baseRow({ status: "deposited" }))).toBe(true)
  })

  it("excludes pending, failed, and cancelled rows", () => {
    expect(isSuccessfulFeedTransaction(baseRow({ status: "pending" }))).toBe(false)
    expect(isSuccessfulFeedTransaction(baseRow({ status: "failed" }))).toBe(false)
    expect(isSuccessfulFeedTransaction(baseRow({ status: "cancelled" }))).toBe(false)
  })

  it("treats in-flight YC pay-ins as unsuccessful even when ledger is pending", () => {
    expect(
      isSuccessfulFeedTransaction(
        baseRow({
          status: "pending",
          metadata: { yc_mode: "fund_balance" },
        }),
      ),
    ).toBe(false)
  })
})

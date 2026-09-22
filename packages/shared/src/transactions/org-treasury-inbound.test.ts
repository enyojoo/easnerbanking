import { describe, expect, it } from "vitest"
import {
  classifyInboundReceiveKind,
  resolveInboundReceiveDetail,
  buildInboundReceiveDetailRows,
} from "./inbound-receive-detail"
import {
  inferLedgerListSourceType,
} from "./map-ledger-list-row"
import {
  toEasnerTransactionPrimaryLabel,
  toEasnerTransactionProductCategory,
} from "./product-label"
import { resolveInboundTransactionListLabel } from "./transaction-list-label"
import { REVIEW_ROW_LABELS } from "../review-row-labels"
import {
  classifyOrgTreasuryInboundBackfill,
  mergeOrgTreasuryInboundMetadataPatch,
  resolveOrgTreasuryInboundKind,
  resolveOrgTreasuryInboundTitle,
} from "./org-treasury-inbound"

const sweepMeta = {
  source: "turnkey_balance_webhook",
  fee_wallet_revenue_sweep: true,
}

describe("org treasury inbound titles", () => {
  it("maps each kind to list title, product category, and inbound detail title", () => {
    for (const [kind, title] of [
      ["pay_in_fee", "Pay in fee"],
      ["payout_fee", "Payout fee"],
      ["payout_refund", "Payout refund"],
    ] as const) {
      const meta = { ...sweepMeta, org_treasury_kind: kind }
      expect(
        toEasnerTransactionPrimaryLabel({
          provider: "turnkey",
          direction: "in",
          metadata: meta,
        }),
      ).toBe(title)
      expect(
        toEasnerTransactionProductCategory({
          provider: "turnkey",
          direction: "in",
          metadata: meta,
        }),
      ).toBe(title)
      expect(resolveInboundTransactionListLabel({ name: "Stablecoin Deposit", metadata: meta })).toBe(
        title,
      )
      const snapshot = resolveInboundReceiveDetail({
        direction: "in",
        provider: "turnkey",
        metadata: { ...meta, related_easner_transaction_id: "ETID11111111" },
        chain: "solana",
        asset: "USDC",
        posted_amount: 1.25,
        posted_currency: "USD",
      })
      expect(classifyInboundReceiveKind({ direction: "in", provider: "turnkey", metadata: meta, chain: "solana" })).toBe(
        "stablecoin",
      )
      expect(snapshot?.displayTitle).toBe(title)
      const rows = buildInboundReceiveDetailRows(snapshot!, { surface: "detail" })
      expect(rows.find((r) => r.label === REVIEW_ROW_LABELS.relatedTransaction)).toEqual({
        label: REVIEW_ROW_LABELS.relatedTransaction,
        value: "ETID11111111",
        copyValue: "ETID11111111",
      })
    }
  })

  it("maps fee_wallet_revenue_sweep without kind to Payout fee", () => {
    expect(resolveOrgTreasuryInboundKind(sweepMeta)).toBe("payout_fee")
    expect(resolveOrgTreasuryInboundTitle(sweepMeta)).toBe("Payout fee")
    expect(
      toEasnerTransactionPrimaryLabel({
        provider: "turnkey",
        direction: "in",
        metadata: sweepMeta,
      }),
    ).toBe("Payout fee")
    expect(inferLedgerListSourceType(sweepMeta)).toBe("payout_fee")
    expect(
      resolveOrgTreasuryInboundTitle(
        { source: "turnkey_balance_webhook" },
        { source: "fee_wallet_revenue_sweep" },
      ),
    ).toBe("Payout fee")
  })

  it("leaves unlabeled fee-wallet inbounds as Stablecoin Deposit", () => {
    expect(
      toEasnerTransactionPrimaryLabel({
        provider: "turnkey",
        direction: "in",
        metadata: { source: "turnkey_balance_webhook" },
      }),
    ).toBe("Stablecoin Deposit")
    expect(resolveInboundTransactionListLabel({ source_type: "liquidation_address" })).toBe(
      "Stablecoin Deposit",
    )
  })
})

describe("classifyOrgTreasuryInboundBackfill", () => {
  it("classifies sweep + related deposit as Pay in fee", () => {
    expect(
      classifyOrgTreasuryInboundBackfill({
        metadata: sweepMeta,
        relatedDirection: "in",
        relatedEtid: "ETID22222222",
      }),
    ).toEqual({ kind: "pay_in_fee", relatedEtid: "ETID22222222" })
  })

  it("classifies sweep + related payout as Payout fee", () => {
    expect(
      classifyOrgTreasuryInboundBackfill({
        metadata: sweepMeta,
        relatedDirection: "out",
        relatedEtid: "ETID33333333",
      }),
    ).toEqual({ kind: "payout_fee", relatedEtid: "ETID33333333" })
  })

  it("classifies sweep without related as Payout fee", () => {
    expect(classifyOrgTreasuryInboundBackfill({ metadata: sweepMeta })).toEqual({
      kind: "payout_fee",
      relatedEtid: null,
    })
  })

  it("attaches related ETID from a matched sweep hash", () => {
    expect(
      classifyOrgTreasuryInboundBackfill({
        metadata: { source: "turnkey_balance_webhook" },
        matchedSweepRelatedEtid: "ETID44444444",
      }),
    ).toEqual({ kind: "payout_fee", relatedEtid: "ETID44444444" })
  })

  it("classifies a YC refund hash match as Payout refund even if sweep was stamped", () => {
    expect(
      classifyOrgTreasuryInboundBackfill({
        metadata: sweepMeta,
        matchedRefundRelatedEtid: "ETID55555555",
      }),
    ).toEqual({ kind: "payout_refund", relatedEtid: "ETID55555555" })
  })

  it("skips unlabeled inbounds", () => {
    expect(
      classifyOrgTreasuryInboundBackfill({
        metadata: { source: "turnkey_balance_webhook" },
      }),
    ).toEqual({
      kind: null,
      relatedEtid: null,
      skippedReason: "unlabeled_stablecoin_deposit",
    })
  })

  it("does not rewrite an already-stamped kind unless related is missing", () => {
    const current = {
      org_treasury_kind: "pay_in_fee",
      fee_wallet_revenue_sweep: true,
      related_easner_transaction_id: "ETID66666666",
    }
    const classified = classifyOrgTreasuryInboundBackfill({
      metadata: current,
      relatedDirection: "in",
      relatedEtid: "ETID66666666",
    })
    expect(classified).toEqual({ kind: "pay_in_fee", relatedEtid: "ETID66666666" })
    expect(mergeOrgTreasuryInboundMetadataPatch(current, classified)).toBeNull()
  })
})

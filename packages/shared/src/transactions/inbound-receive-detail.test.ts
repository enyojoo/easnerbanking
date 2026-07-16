import { describe, expect, it } from "vitest"
import { REVIEW_ROW_LABELS } from "../review-row-labels"
import {
  buildInboundReceiveDetailRows,
  buildInboundReceiveEmailDetailRows,
  classifyInboundReceiveKind,
  resolveCreditDestination,
  resolveInboundReceiveDetail,
  resolveInboundReceiveNotification,
} from "./inbound-receive-detail"

function rowMap(rows: { label: string; value: string }[]): Record<string, string> {
  return Object.fromEntries(rows.filter((r) => r.label).map((r) => [r.label, r.value]))
}

describe("classifyInboundReceiveKind", () => {
  it("prioritizes easetag over bank onramp metadata", () => {
    expect(
      classifyInboundReceiveKind({
        direction: "in",
        metadata: { source: "easetag_p2p", flow: "bank_onramp" },
      }),
    ).toBe("easetag_receive")
  })

  it("classifies verification before yc fund balance", () => {
    expect(
      classifyInboundReceiveKind({
        direction: "in",
        metadata: { deposit_kind: "verification", activity_type: "fund_balance" },
      }),
    ).toBe("noah_verification")
  })

  it("classifies yc fund_balance from deposit_review", () => {
    expect(
      classifyInboundReceiveKind({
        direction: "in",
        deposit_review: {
          local_pay_in: 1000,
          local_currency: "NGN",
          usd_credit: 1,
          processing_fee: 0,
          exchange_rate: 1500,
          transfer_method: "Bank Transfer",
          credit_to: "USD Balance",
          residence_country: "NG",
          pay_in_rail: "bank_transfer",
        },
      }),
    ).toBe("yc_fund_balance")
  })
})

describe("resolveCreditDestination", () => {
  it("uses credit_for for verification", () => {
    const dest = resolveCreditDestination("USD", "noah_verification")
    expect(dest.label).toBe("credit_for")
    expect(dest.balanceLabel).toBe("USD Balance")
    expect(dest.hint).toBeTruthy()
  })

  it("uses credit_to for funding deposits", () => {
    expect(resolveCreditDestination("EUR", "noah_va_funding").label).toBe("credit_to")
  })
})

describe("buildInboundReceiveDetailRows", () => {
  it("YC fund_balance row order and labels", () => {
    const snapshot = resolveInboundReceiveDetail({
      direction: "in",
      deposit_review: {
        local_pay_in: 100000,
        local_currency: "NGN",
        usd_credit: 65,
        processing_fee: 0.65,
        exchange_fee: 0.1,
        exchange_rate: 1538.46,
        transfer_method: "Bank Transfer",
        credit_to: "USD Balance",
        residence_country: "NG",
        pay_in_rail: "bank_transfer",
      },
      ledger_created_at: "2026-01-15T12:00:00.000Z",
    })
    expect(snapshot).not.toBeNull()
    const rows = buildInboundReceiveDetailRows(snapshot!, { surface: "detail" })
    const labels = rows.filter((r) => r.label).map((r) => r.label)
    expect(labels).toEqual([
      REVIEW_ROW_LABELS.amountPaid,
      REVIEW_ROW_LABELS.processingFee,
      REVIEW_ROW_LABELS.exchangeRate,
      REVIEW_ROW_LABELS.amountCredited,
      REVIEW_ROW_LABELS.creditTo,
      REVIEW_ROW_LABELS.scheme,
      REVIEW_ROW_LABELS.when,
    ])
    const map = rowMap(rows)
    expect(map[REVIEW_ROW_LABELS.amountCredited]).toBe("$65")
    expect(map[REVIEW_ROW_LABELS.scheme]).toBe("Bank Transfer")
  })

  it("Noah VA funding includes credit to and narration on detail", () => {
    const snapshot = resolveInboundReceiveDetail({
      direction: "in",
      provider: "noah",
      metadata: {
        flow: "bank_onramp",
        source_type: "virtual_account",
        posted_amount: 50,
        posted_currency: "USD",
        fee_amount: 0.05,
        deposit_scheme_label: "Wire",
        sender_name: "ACME CORP",
        narration: "Invoice 42",
      },
      ledger_created_at: "2026-01-15T12:00:00.000Z",
    })
    expect(snapshot?.kind).toBe("noah_va_funding")
    const map = rowMap(buildInboundReceiveDetailRows(snapshot!, { surface: "detail" }))
    expect(map[REVIEW_ROW_LABELS.scheme]).toBe("Wire")
    expect(map[REVIEW_ROW_LABELS.sender]).toBe("Acme Corp")
    expect(map[REVIEW_ROW_LABELS.amountCredited]).toBe("$50")
    expect(map[REVIEW_ROW_LABELS.creditTo]).toBe("USD Balance")
    expect(map[REVIEW_ROW_LABELS.narration]).toBe("Invoice 42")
  })

  it("verification uses credit for and detail hint", () => {
    const snapshot = resolveInboundReceiveDetail({
      direction: "in",
      metadata: {
        deposit_kind: "verification",
        posted_amount: 0.32,
        posted_currency: "USD",
        deposit_scheme_label: "ACH",
        verification_bank_name: "Chase",
      },
      ledger_created_at: "2026-01-15T12:00:00.000Z",
    })
    expect(snapshot?.kind).toBe("noah_verification")
    const rows = buildInboundReceiveDetailRows(snapshot!, { surface: "detail" })
    expect(rows.some((r) => r.label === REVIEW_ROW_LABELS.creditFor)).toBe(true)
    expect(rows.some((r) => r.isVerificationHint)).toBe(true)
    expect(
      buildInboundReceiveEmailDetailRows(snapshot!).some((r) =>
        r.value.includes("not added to your spendable balance"),
      ),
    ).toBe(false)
  })

  it("stablecoin and easetag include credit to", () => {
    const stablecoin = resolveInboundReceiveDetail({
      direction: "in",
      provider: "turnkey",
      metadata: { source_type: "liquidation_address" },
      chain: "solana",
      posted_amount: 25,
      posted_currency: "USD",
    })
    expect(stablecoin?.kind).toBe("stablecoin")
    const stablecoinEmail = rowMap(buildInboundReceiveDetailRows(stablecoin!, { surface: "email" }))
    expect(stablecoinEmail[REVIEW_ROW_LABELS.creditTo]).toBe("USD Balance")
    expect(stablecoinEmail[REVIEW_ROW_LABELS.amountCredited]).toBeUndefined()

    const easetag = resolveInboundReceiveDetail({
      direction: "in",
      metadata: { source: "easetag_p2p", sender_easetag: "jane", amount: 10, currency: "USD" },
      amount: 10,
      currency: "USD",
    })
    expect(easetag?.kind).toBe("easetag_receive")
    const easetagRows = rowMap(buildInboundReceiveEmailDetailRows(easetag!))
    expect(easetagRows[REVIEW_ROW_LABELS.scheme]).toBe("Easetag")
    expect(easetagRows[REVIEW_ROW_LABELS.amountCredited]).toBeUndefined()
    expect(easetagRows[REVIEW_ROW_LABELS.creditTo]).toBe("USD Balance")
  })
})

describe("resolveInboundReceiveNotification", () => {
  it("returns stablecoin complete title/body", () => {
    const snapshot = resolveInboundReceiveDetail({
      direction: "in",
      provider: "turnkey",
      metadata: { source_type: "liquidation_address" },
      chain: "solana",
      posted_amount: 25,
      posted_currency: "USD",
    })!
    const notify = resolveInboundReceiveNotification(snapshot)
    expect(notify.successTitle).toBe("Stablecoin deposit complete")
    expect(notify.successBody).toContain("USD Balance")
  })

  it("returns easetag received body with handle", () => {
    const snapshot = resolveInboundReceiveDetail({
      direction: "in",
      metadata: { source: "easetag_p2p", sender_easetag: "jane" },
      amount: 5,
      currency: "USD",
    })!
    const notify = resolveInboundReceiveNotification(snapshot)
    expect(notify.successBody).toContain("@jane")
  })
})

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
      REVIEW_ROW_LABELS.exchangeRate,
      REVIEW_ROW_LABELS.depositAmount,
      REVIEW_ROW_LABELS.processingFee,
      REVIEW_ROW_LABELS.amountPaid,
      REVIEW_ROW_LABELS.amountCredited,
      REVIEW_ROW_LABELS.creditTo,
      REVIEW_ROW_LABELS.depositMethod,
      REVIEW_ROW_LABELS.when,
    ])
    const map = rowMap(rows)
    expect(map[REVIEW_ROW_LABELS.amountCredited]).toBe("+$65")
    expect(map[REVIEW_ROW_LABELS.depositMethod]).toBe("Bank Transfer")
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
    const rows = buildInboundReceiveDetailRows(snapshot!, { surface: "detail" })
    const map = rowMap(rows)
    expect(map[REVIEW_ROW_LABELS.depositMethod]).toBe("Wire")
    expect(map[REVIEW_ROW_LABELS.sender]).toBe("Acme Corp")
    expect(map[REVIEW_ROW_LABELS.amountCredited]).toBe("+$50")
    expect(map[REVIEW_ROW_LABELS.creditTo]).toBe("USD Balance")
    expect(map[REVIEW_ROW_LABELS.narration]).toBe("Invoice 42")
    const labels = rows.filter((r) => r.label).map((r) => r.label)
    expect(labels.at(-2)).toBe(REVIEW_ROW_LABELS.depositMethod)
    expect(labels.at(-1)).toBe(REVIEW_ROW_LABELS.when)
  })

  it("Noah VA funding without fee omits amount credited on detail", () => {
    const snapshot = resolveInboundReceiveDetail({
      direction: "in",
      provider: "noah",
      metadata: {
        flow: "bank_onramp",
        source_type: "virtual_account",
        posted_amount: 50,
        posted_currency: "USD",
        deposit_scheme_label: "Wire",
        sender_name: "ACME CORP",
      },
      ledger_created_at: "2026-01-15T12:00:00.000Z",
    })
    expect(snapshot?.kind).toBe("noah_va_funding")
    expect(snapshot?.processingFee).toBeUndefined()
    const map = rowMap(buildInboundReceiveDetailRows(snapshot!, { surface: "detail" }))
    expect(map[REVIEW_ROW_LABELS.amountCredited]).toBeUndefined()
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
    expect(rows.some((r) => r.label === REVIEW_ROW_LABELS.amountCredited)).toBe(false)
    expect(rows.some((r) => r.isVerificationHint)).toBe(true)
    expect(rows.at(-1)?.label).toBe(REVIEW_ROW_LABELS.when)
    expect(
      buildInboundReceiveEmailDetailRows(snapshot!).some((r) =>
        r.value.includes("not added to your spendable balance"),
      ),
    ).toBe(false)
  })

  it("classifies relay Tron deposit as stablecoin inbound", () => {
    expect(
      classifyInboundReceiveKind({
        direction: "in",
        metadata: { activity_type: "relay_tron_deposit" },
      }),
    ).toBe("stablecoin")
  })

  it("classifies relay Tron deposit as stablecoin inbound without provider field", () => {
    expect(
      classifyInboundReceiveKind({
        direction: "in",
        metadata: {
          activity_type: "relay_tron_deposit",
          source_currency: "USDT",
          source_payment_rail: "tron",
        },
      }),
    ).toBe("stablecoin")
  })

  it("relay Tron deposit shows processing fee and amount credited like VA", () => {
    const snapshot = resolveInboundReceiveDetail({
      direction: "in",
      provider: "relay",
      metadata: {
        activity_type: "relay_tron_deposit",
        source_payment_rail: "tron",
        source_currency: "USDT",
        gross_usdt: 100,
        posted_amount: 99,
        posted_currency: "USD",
        fee_amount: 1,
      },
      amount: 99,
      currency: "USD",
      ledger_created_at: "2026-01-15T12:00:00.000Z",
    })
    expect(snapshot?.kind).toBe("stablecoin")
    expect(snapshot?.scheme).toBe("USDT on Tron")
    expect(snapshot?.depositAmount).toEqual({ amount: 100, currency: "USD" })
    const map = rowMap(buildInboundReceiveDetailRows(snapshot!, { surface: "detail" }))
    expect(map[REVIEW_ROW_LABELS.depositAmount]).toBeUndefined()
    expect(map[REVIEW_ROW_LABELS.processingFee]).toBe("$1")
    expect(map[REVIEW_ROW_LABELS.amountCredited]).toBe("+$99")
    expect(map[REVIEW_ROW_LABELS.creditTo]).toBe("USD Balance")
    const emailMap = rowMap(buildInboundReceiveEmailDetailRows(snapshot!))
    expect(emailMap[REVIEW_ROW_LABELS.depositAmount]).toBe("$100")
    expect(emailMap[REVIEW_ROW_LABELS.amountCredited]).toBe("+$99")
  })

  it("stablecoin without fee omits amount credited on detail", () => {
    const snapshot = resolveInboundReceiveDetail({
      direction: "in",
      provider: "turnkey",
      metadata: { source_type: "liquidation_address", source_payment_rail: "solana", source_currency: "USDC" },
      chain: "solana",
      asset: "USDC",
      counterparty_address: "Fjw9otXwdkzbc3feiBzBnFqCr52858YbyZsxxLWfP5Xc",
      posted_amount: 25,
      posted_currency: "USD",
      created_at: "2026-01-15T12:00:00.000Z",
    })
    expect(snapshot?.processingFee).toBeUndefined()
    const map = rowMap(buildInboundReceiveDetailRows(snapshot!, { surface: "detail" }))
    expect(map[REVIEW_ROW_LABELS.amountCredited]).toBeUndefined()
  })

  it("stablecoin deposit shows masked sender wallet address", () => {
    const snapshot = resolveInboundReceiveDetail({
      direction: "in",
      provider: "turnkey",
      metadata: { source_type: "liquidation_address", source_payment_rail: "solana", source_currency: "USDC" },
      chain: "solana",
      asset: "USDC",
      counterparty_address: "Fjw9otXwdkzbc3feiBzBnFqCr52858YbyZsxxLWfP5Xc",
      posted_amount: 25,
      posted_currency: "USD",
      created_at: "2026-01-15T12:00:00.000Z",
    })
    expect(snapshot?.scheme).toBe("USDC on Solana")
    expect(snapshot?.senderCopyValue).toBe("Fjw9otXwdkzbc3feiBzBnFqCr52858YbyZsxxLWfP5Xc")
    const rows = buildInboundReceiveDetailRows(snapshot!, { surface: "detail" })
    const map = rowMap(rows)
    expect(map[REVIEW_ROW_LABELS.sender]).toBe("Fjw9ot...WfP5Xc")
    const senderRow = rows.find((r) => r.label === REVIEW_ROW_LABELS.sender)
    expect(senderRow?.copyValue).toBe("Fjw9otXwdkzbc3feiBzBnFqCr52858YbyZsxxLWfP5Xc")
    expect(rows.at(-1)?.label).toBe(REVIEW_ROW_LABELS.when)
  })

  it("stablecoin and easetag include credit to", () => {
    const stablecoin = resolveInboundReceiveDetail({
      direction: "in",
      provider: "turnkey",
      metadata: { source_type: "liquidation_address" },
      chain: "solana",
      posted_amount: 25,
      posted_currency: "USD",
      created_at: "2026-01-15T12:00:00.000Z",
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
      created_at: "2026-01-15T12:00:00.000Z",
    })
    expect(easetag?.kind).toBe("easetag_receive")
    const easetagRows = rowMap(buildInboundReceiveEmailDetailRows(easetag!))
    expect(easetagRows[REVIEW_ROW_LABELS.depositMethod]).toBe("Easetag")
    expect(easetagRows[REVIEW_ROW_LABELS.amountCredited]).toBeUndefined()
    expect(easetagRows[REVIEW_ROW_LABELS.creditTo]).toBe("USD Balance")

    expect(buildInboundReceiveDetailRows(stablecoin!, { surface: "detail" }).at(-1)?.label).toBe(
      REVIEW_ROW_LABELS.when,
    )
    expect(buildInboundReceiveDetailRows(easetag!, { surface: "detail" }).at(-1)?.label).toBe(
      REVIEW_ROW_LABELS.when,
    )
    expect(buildInboundReceiveDetailRows(stablecoin!, { surface: "email" })).not.toContainEqual(
      expect.objectContaining({ label: REVIEW_ROW_LABELS.when }),
    )
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
    expect(notify.successBody).toBe("You've received $25 via address")
  })

  it("relay stablecoin notification shows gross received from sender address", () => {
    const snapshot = resolveInboundReceiveDetail({
      direction: "in",
      provider: "relay",
      metadata: {
        activity_type: "relay_tron_deposit",
        gross_usdt: 3,
        posted_amount: 2.307509,
        posted_currency: "USD",
        fee_amount: 0.692491,
        sender_tron_address: "TQbRULEB1NwizCwpCHTGbmt4Nnsfej6VhT",
      },
      counterparty_address: "TQbRULEB1NwizCwpCHTGbmt4Nnsfej6VhT",
      amount: 2.31,
      currency: "USD",
    })!
    const notify = resolveInboundReceiveNotification(snapshot)
    expect(notify.successTitle).toBe("Stablecoin deposit complete")
    expect(notify.successBody).toBe("You've received $3 from TQbRUL...ej6VhT")
  })

  it("returns easetag received body with handle", () => {
    const snapshot = resolveInboundReceiveDetail({
      direction: "in",
      metadata: { source: "easetag_p2p", sender_easetag: "jane" },
      amount: 5,
      currency: "USD",
    })!
    const notify = resolveInboundReceiveNotification(snapshot)
    expect(notify.successBody).toBe("You've received $5 from @jane")
  })

  it("returns YC fund balance body with local pay-in and scheme", () => {
    const snapshot = resolveInboundReceiveDetail({
      direction: "in",
      provider: "yellowcard",
      metadata: {
        yc_mode: "fund_balance",
        deposit_review: {
          local_pay_in: 100000,
          local_currency: "NGN",
          usd_credit: 65,
          processing_fee: 0.65,
          exchange_rate: 1538,
          transfer_method: "Bank Transfer",
          credit_to: "USD Balance",
          residence_country: "NG",
          pay_in_rail: "bank_transfer",
        },
      },
    })!
    const notify = resolveInboundReceiveNotification(snapshot)
    expect(notify.successBody).toBe("You've received ₦100,000 via Bank Transfer")
  })

  it("returns Noah VA body with sender name", () => {
    const snapshot = resolveInboundReceiveDetail({
      direction: "in",
      provider: "noah",
      metadata: {
        flow: "bank_onramp",
        source_type: "virtual_account",
        fiat_deposit_amount: 100,
        fiat_deposit_currency: "USD",
        posted_amount: 99.5,
        posted_currency: "USD",
        sender_name: "ACME CORP",
      },
    })!
    const notify = resolveInboundReceiveNotification(snapshot)
    expect(notify.successBody).toBe("You've received $100 from Acme Corp")
  })
})

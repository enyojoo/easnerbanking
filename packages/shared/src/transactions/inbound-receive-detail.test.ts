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
    ).toBe("bank_verification")
  })

  it("classifies Express deposits before YC deposit_review", () => {
    expect(
      classifyInboundReceiveKind({
        direction: "in",
        metadata: {
          flow: "express_deposits",
          payment_method: "card",
          deposit_review: {
            you_get: 50,
            you_get_currency: "USD",
            you_pay: 48.2,
            you_pay_currency: "EUR",
            payment_method: "card",
          },
        },
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
    ).toBe("express_deposits")
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
    const dest = resolveCreditDestination("USD", "bank_verification")
    expect(dest.label).toBe("credit_for")
    expect(dest.balanceLabel).toBe("USD Balance")
    expect(dest.hint).toBeTruthy()
  })

  it("uses credit_to for funding deposits", () => {
    expect(resolveCreditDestination("EUR", "va_funding").label).toBe("credit_to")
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
    expect(snapshot?.kind).toBe("va_funding")
    const rows = buildInboundReceiveDetailRows(snapshot!, { surface: "detail" })
    const map = rowMap(rows)
    expect(map[REVIEW_ROW_LABELS.depositMethod]).toBe("Wire")
    expect(map[REVIEW_ROW_LABELS.sender]).toBeUndefined()
    expect(map[REVIEW_ROW_LABELS.amountCredited]).toBe("+$50")
    expect(map[REVIEW_ROW_LABELS.creditTo]).toBe("USD Balance")
    expect(map[REVIEW_ROW_LABELS.narration]).toBe("Invoice 42")
    const labels = rows.filter((r) => r.label).map((r) => r.label)
    expect(labels.at(-2)).toBe(REVIEW_ROW_LABELS.depositMethod)
    expect(labels.at(-1)).toBe(REVIEW_ROW_LABELS.when)
    const emailMap = rowMap(buildInboundReceiveEmailDetailRows(snapshot!))
    expect(emailMap[REVIEW_ROW_LABELS.sender]).toBe("Acme Corp")
  })

  it("Grid VA funding reads sender and ACH from stored webhook payload", () => {
    const snapshot = resolveInboundReceiveDetail({
      direction: "in",
      provider: "grid",
      metadata: {
        flow: "bank_onramp",
        grid_va_inbound: true,
        fiat_deposit_amount: 1,
        fiat_deposit_currency: "USD",
      },
      payload: {
        source: {
          paymentRail: "ACH",
          accountHolderName: "Bridge Building",
        },
        receivedAmount: { amount: 100, currency: { code: "USD", decimals: 2 } },
      },
      ledger_created_at: "2026-08-19T04:01:26.000Z",
    })
    expect(snapshot?.kind).toBe("va_funding")
    const map = rowMap(buildInboundReceiveDetailRows(snapshot!, { surface: "detail" }))
    expect(map[REVIEW_ROW_LABELS.sender]).toBeUndefined()
    expect(map[REVIEW_ROW_LABELS.creditTo]).toBe("USD Balance")
    expect(map[REVIEW_ROW_LABELS.depositMethod]).toBe("ACH")
    expect(rowMap(buildInboundReceiveEmailDetailRows(snapshot!))[REVIEW_ROW_LABELS.sender]).toBe(
      "Bridge Building",
    )
  })

  it("Grid VA funding uses the same Credited to card as Noah", () => {
    const snapshot = resolveInboundReceiveDetail({
      direction: "in",
      provider: "grid",
      metadata: {
        flow: "bank_onramp",
        grid_va_inbound: true,
        posted_amount: 50,
        posted_currency: "USD",
        fee_amount: 0,
        deposit_scheme_label: "ACH",
        sender_name: "ACME CORP",
      },
      ledger_created_at: "2026-01-15T12:00:00.000Z",
    })
    expect(snapshot?.kind).toBe("va_funding")
    const map = rowMap(buildInboundReceiveDetailRows(snapshot!, { surface: "detail" }))
    expect(map[REVIEW_ROW_LABELS.creditTo]).toBe("USD Balance")
    expect(map[REVIEW_ROW_LABELS.sender]).toBeUndefined()
  })

  it("skips Stripe collection settlement as VA funding", () => {
    expect(
      classifyInboundReceiveKind({
        direction: "in",
        provider: "grid",
        metadata: { flow: "bank_onramp", source: "invoice_stripe", invoice_id: "inv_1" },
      }),
    ).toBeNull()
  })

  it("Noah VA funding with a $0 fee still shows the processing fee row", () => {
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
    expect(snapshot?.kind).toBe("va_funding")
    expect(snapshot?.processingFee).toEqual({ amount: 0, currency: "USD" })
    const map = rowMap(buildInboundReceiveDetailRows(snapshot!, { surface: "detail" }))
    expect(map[REVIEW_ROW_LABELS.processingFee]).toMatch(/^\$0/)
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
    expect(snapshot?.kind).toBe("bank_verification")
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
    expect(snapshot?.processingFee).toEqual({ amount: 0, currency: "USD" })
    const map = rowMap(buildInboundReceiveDetailRows(snapshot!, { surface: "detail" }))
    expect(map[REVIEW_ROW_LABELS.processingFee]).toMatch(/^\$0/)
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

describe("Express deposits inbound receive", () => {
  const euMeta = {
    flow: "express_deposits",
    payment_method: "card",
    usd_credit: 50,
    deposit_review: {
      you_get: 50,
      you_get_currency: "USD",
      you_pay: 46.2,
      you_pay_currency: "EUR",
      payment_method: "card",
    },
  }

  it("shows you pay, you get, credit destination, method, and processing fee", () => {
    const withFee = {
      ...euMeta,
      deposit_review: {
        ...euMeta.deposit_review,
        processing_fee: 2.5,
        processing_fee_currency: "EUR",
        stripe_fees: { transaction: 2, network: 0.5, total: 2.5 },
        payment_method_brand: "visa",
        payment_method_last4: "9082",
      },
    }
    const snapshot = resolveInboundReceiveDetail({
      direction: "in",
      provider: "stripe",
      metadata: withFee,
      amount: 50,
      currency: "USD",
      ledger_created_at: "2026-01-15T12:00:00.000Z",
    })
    expect(snapshot?.kind).toBe("express_deposits")
    expect(snapshot?.displayTitle).toBe("Card deposit")
    expect(snapshot?.amountPaid).toEqual({ amount: 46.2, currency: "EUR" })
    expect(snapshot?.amountCredited).toEqual({ amount: 50, currency: "USD" })
    expect(snapshot?.processingFee).toEqual({ amount: 2.5, currency: "EUR" })
    const map = rowMap(buildInboundReceiveDetailRows(snapshot!, { surface: "detail" }))
    expect(map[REVIEW_ROW_LABELS.processingFee]).toBe("€2.50")
    expect(map[REVIEW_ROW_LABELS.amountPaid]).toBe("€46.20")
    expect(map[REVIEW_ROW_LABELS.amountCredited]).toBe("+$50")
    expect(map[REVIEW_ROW_LABELS.creditTo]).toBe("USD Balance")
    expect(map[REVIEW_ROW_LABELS.depositMethod]).toBe("Visa ····9082")
    expect(snapshot?.paymentMethodDisplay).toEqual({
      iconKey: "visa",
      text: "•••• 9082",
      accessibilityLabel: "Visa ····9082",
    })
    const detailRows = buildInboundReceiveDetailRows(snapshot!, { surface: "detail" })
    const depositRow = detailRows.find((row) => row.label === REVIEW_ROW_LABELS.depositMethod)
    expect(depositRow?.paymentMethodDisplay?.iconKey).toBe("visa")
    expect(map[REVIEW_ROW_LABELS.exchangeRate]).toBeTruthy()
    const email = rowMap(buildInboundReceiveEmailDetailRows(snapshot!))
    expect(email[REVIEW_ROW_LABELS.processingFee]).toBe("€2.50")
    expect(email[REVIEW_ROW_LABELS.amountCredited]).toBe("+$50")
    expect(resolveInboundReceiveNotification(snapshot!).successBody).toBe(
      "You've received $50 via Card deposit",
    )
  })

  it("hides amount credited but keeps fee and amount paid for same-currency USD card deposits", () => {
    const snapshot = resolveInboundReceiveDetail({
      direction: "in",
      provider: "stripe",
      metadata: {
        flow: "express_deposits",
        payment_method: "card",
        usd_credit: 100,
        deposit_review: {
          you_get: 100,
          you_get_currency: "USD",
          you_pay: 104.04,
          you_pay_currency: "USD",
          processing_fee: 4.04,
          processing_fee_currency: "USD",
          payment_method: "card",
          payment_method_brand: "visa",
          payment_method_last4: "9082",
        },
      },
      amount: 100,
      currency: "USD",
      ledger_created_at: "2026-01-15T12:00:00.000Z",
    })
    expect(snapshot?.kind).toBe("express_deposits")
    const map = rowMap(buildInboundReceiveDetailRows(snapshot!, { surface: "detail" }))
    expect(map[REVIEW_ROW_LABELS.processingFee]).toBe("$4.04")
    expect(map[REVIEW_ROW_LABELS.amountPaid]).toBe("$104.04")
    expect(map[REVIEW_ROW_LABELS.amountCredited]).toBeUndefined()
    expect(map[REVIEW_ROW_LABELS.creditTo]).toBe("USD Balance")
  })
})

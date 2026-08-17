import { describe, expect, it } from "vitest"
import { deriveTransactionNotification } from "./derive-transaction-notification"

describe("deriveTransactionNotification YC fund_balance", () => {
  it("uses country bank deposit activity label", () => {
    const descriptor = deriveTransactionNotification({
      provider: "yellowcard",
      direction: "in",
      amount: 65,
      currency: "USD",
      metadata: {
        yc_mode: "fund_balance",
        flow: "bank_onramp",
        deposit_display_title: "Nigeria Bank Deposit",
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
      outcome: "success",
    })

    expect(descriptor.pushTitle).toBe("Nigeria bank deposit complete")
    expect(descriptor.pushBody).toBe("You've received ₦100,000 via Bank Transfer")
    expect(descriptor.amountDisplay).toBe("₦100,000")
  })

  it("uses MOMO failed headline", () => {
    const descriptor = deriveTransactionNotification({
      provider: "yellowcard",
      direction: "in",
      amount: 65,
      currency: "USD",
      metadata: {
        yc_mode: "fund_balance",
        deposit_display_title: "Nigeria MOMO Deposit",
      },
      outcome: "failed",
    })

    expect(descriptor.pushTitle).toBe("Nigeria MOMO deposit failed")
  })
})

describe("deriveTransactionNotification Noah VA funding", () => {
  it("uses US bank deposit activity label for USD VA funding", () => {
    const descriptor = deriveTransactionNotification({
      provider: "noah",
      direction: "in",
      amount: 100,
      currency: "USD",
      metadata: {
        flow: "bank_onramp",
        fiat_deposit_currency: "USD",
      },
      outcome: "success",
    })

    expect(descriptor.pushTitle).toBe("US bank deposit complete")
    expect(descriptor.pushBody).toBe("You've received $100 via ACH")
    expect(descriptor.amountDisplay).toBe("$100")
  })

  it("uses sender name in push body when available", () => {
    const descriptor = deriveTransactionNotification({
      provider: "noah",
      direction: "in",
      amount: 100,
      currency: "USD",
      metadata: {
        flow: "bank_onramp",
        source_type: "virtual_account",
        fiat_deposit_currency: "USD",
        fiat_deposit_amount: 100,
        posted_amount: 99.5,
        posted_currency: "USD",
        sender_name: "ACME CORP",
      },
      outcome: "success",
    })

    expect(descriptor.pushBody).toBe("You've received $100 from Acme Corp")
    expect(descriptor.amountDisplay).toBe("$100")
  })
})

describe("deriveTransactionNotification easetag deposit", () => {
  it("uses Easetag deposit title and received-from body", () => {
    const descriptor = deriveTransactionNotification({
      provider: "easner_internal",
      direction: "in",
      amount: 5,
      currency: "USD",
      metadata: { source: "easetag_p2p", sender_easetag: "jane" },
      outcome: "success",
    })

    expect(descriptor.pushTitle).toBe("Easetag deposit complete")
    expect(descriptor.emailSubject).toBe("Easetag deposit complete")
    expect(descriptor.pushBody).toBe("You've received $5 from @jane")
    expect(descriptor.body).toBe(descriptor.pushBody)
  })
})

describe("deriveTransactionNotification relay stablecoin deposit", () => {
  it("uses gross sent amount for display and sender address in body", () => {
    const descriptor = deriveTransactionNotification({
      provider: "relay",
      direction: "in",
      amount: 2.31,
      currency: "USD",
      metadata: {
        activity_type: "relay_tron_deposit",
        gross_usdt: 3,
        posted_amount: 2.307509,
        posted_currency: "USD",
        fee_amount: 0.692491,
        sender_tron_address: "TQbRULEB1NwizCwpCHTGbmt4Nnsfej6VhT",
        from_address: "TQbRULEB1NwizCwpCHTGbmt4Nnsfej6VhT",
      },
      outcome: "success",
    })

    expect(descriptor.amountDisplay).toBe("$3")
    expect(descriptor.pushTitle).toBe("Stablecoin deposit complete")
    expect(descriptor.pushBody).toBe("You've received $3 from TQbRUL...ej6VhT")
    expect(descriptor.body).toBe("You've received $3 from TQbRUL...ej6VhT")
    expect(descriptor.counterpartyName).toBe("TQbRUL...ej6VhT")
  })
})

describe("deriveTransactionNotification balance convert", () => {
  it("uses move between accounts activity label and success body", () => {
    const descriptor = deriveTransactionNotification({
      direction: "out",
      amount: 500,
      currency: "USD",
      metadata: {
        flow: "balance_convert",
        move_review: {
          source_amount: 500,
          source_currency: "USD",
          destination_amount: 460.12,
          destination_currency: "EUR",
          exchange_rate: 0.92024,
          processing_fee: 0,
          total_debited: 500,
          debited_from_label: "USD Balance",
          credited_to_label: "EUR Balance",
        },
      },
      outcome: "success",
    })

    expect(descriptor.pushTitle).toBe("Move between accounts complete")
    expect(descriptor.body).toBe(
      "You moved $500 from your USD Balance to your EUR Balance.",
    )
    expect(descriptor.category).toBe("Move between accounts")
    expect(descriptor.emailEnabled).toBe(true)
  })

  it("uses failed move body", () => {
    const descriptor = deriveTransactionNotification({
      direction: "out",
      amount: 500,
      currency: "USD",
      metadata: { flow: "balance_convert" },
      outcome: "failed",
    })

    expect(descriptor.pushTitle).toBe("Move between accounts failed")
    expect(descriptor.body).toBe("Your move of $500 could not be completed.")
  })
})

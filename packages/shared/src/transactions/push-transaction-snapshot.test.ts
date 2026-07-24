import { describe, expect, it } from "vitest"
import {
  parsePushTransactionSnapshot,
  pushTransactionDetailAliasIds,
} from "./push-transaction-snapshot"

describe("parsePushTransactionSnapshot", () => {
  it("returns null without transaction id", () => {
    expect(parsePushTransactionSnapshot({ type: "transaction_settled" })).toBeNull()
  })

  it("maps easetag outbound push payload to mobile row shape", () => {
    const row = parsePushTransactionSnapshot({
      type: "transaction_settled",
      transactionId: "6ec5b65f-2d65-4208-999f-86e3c4e67c35",
      easnerTransactionId: "ETID88873887",
      amount: 1,
      currency: "USD",
      direction: "out",
      status: "settled",
      category: "Easetag Send",
      displayTitle: "Sent to @channelle",
    })

    expect(row).toMatchObject({
      ledger_row_id: "6ec5b65f-2d65-4208-999f-86e3c4e67c35",
      transaction_id: "ETID88873887",
      amount: 1,
      currency: "USD",
      status: "completed",
      transaction_type: "send",
      display_hero_title: "Sent to @channelle",
    })
  })

  it("maps inbound receive with ledger id only", () => {
    const row = parsePushTransactionSnapshot({
      transactionId: "uuid-in",
      amount: 25.5,
      currency: "eur",
      direction: "in",
    })

    expect(row).toMatchObject({
      ledger_row_id: "uuid-in",
      transaction_id: "uuid-in",
      amount: 25.5,
      currency: "EUR",
      transaction_type: "receive",
    })
  })
})

describe("pushTransactionDetailAliasIds", () => {
  it("returns both ledger uuid and ETID when different", () => {
    expect(
      pushTransactionDetailAliasIds({
        transactionId: "6ec5b65f-2d65-4208-999f-86e3c4e67c35",
        easnerTransactionId: "ETID88873887",
      }),
    ).toEqual(["6ec5b65f-2d65-4208-999f-86e3c4e67c35", "ETID88873887"])
  })

  it("dedupes when ids match", () => {
    expect(
      pushTransactionDetailAliasIds({
        transactionId: "ETID88873887",
        easnerTransactionId: "ETID88873887",
      }),
    ).toEqual(["ETID88873887"])
  })
})

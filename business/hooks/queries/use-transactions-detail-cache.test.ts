import { QueryClient } from "@tanstack/react-query"
import { describe, expect, it } from "vitest"
import { qk, type Scope } from "@easner/shared"
import {
  findCachedTransactionForDetail,
  type TransactionsPage,
} from "./use-transactions"
import type { TransactionWithSource } from "@/lib/transactions"

const userScope: Scope = { kind: "business", orgId: "user-1", entityId: "user-1" }
const orgScope: Scope = { kind: "business", orgId: "biz-1", entityId: "biz-1" }

function tx(id: string): TransactionWithSource {
  return {
    id,
    type: "send",
    amount: 1.52,
    description: "Samuel Enyojo Odiba",
    date: "2026-08-19T12:00:00.000Z",
    status: "completed",
    direction: "debit",
    source: "account",
    reference: id,
  }
}

describe("findCachedTransactionForDetail", () => {
  it("reuses a list row after scope flips from user id to business id", () => {
    const queryClient = new QueryClient()
    queryClient.setQueryData(qk.transactions.list(userScope, { limit: 50 }), {
      pages: [{ transactions: [tx("ETID48224171")], nextCursor: null } satisfies TransactionsPage],
      pageParams: [null],
    })

    expect(findCachedTransactionForDetail(queryClient, "ETID48224171", orgScope)?.id).toBe(
      "ETID48224171",
    )
  })

  it("reuses detail cached under the previous scope", () => {
    const queryClient = new QueryClient()
    queryClient.setQueryData(qk.transactions.detail(userScope, "ETID48224171"), tx("ETID48224171"))

    expect(findCachedTransactionForDetail(queryClient, "etid48224171", orgScope)?.id).toBe(
      "ETID48224171",
    )
  })
})

import type { Invoice } from "@/lib/b2b/types"
import type { Transaction } from "@/lib/finance-types"
import { sortDepositsByMatch } from "@/lib/invoices/deposit-match"

export type InboundDepositSource = "bank" | "stablecoin"

export interface InboundDeposit {
  id: string
  amount: number
  currency: string
  date: string
  source: InboundDepositSource
  label: string
  reference?: string
}

function ledgerCreditToInboundDeposit(t: Transaction): InboundDeposit | null {
  if (t.direction !== "credit") return null
  if (t.type === "card") return null
  if (t.type === "stablecoin") {
    const cur = t.displayCurrency || "USD"
    return {
      id: t.id,
      amount: Math.abs(t.amount),
      currency: cur,
      date: t.date,
      source: "stablecoin",
      label: t.description || "Stablecoin Deposit",
      reference: t.reference,
    }
  }
  const method =
    t.type === "ach" ? "ACH" : t.type === "wire" ? "Wire" : t.type === "book" ? "Book" : t.type
  const cur = t.displayCurrency || "USD"
  return {
    id: t.id,
    amount: Math.abs(t.amount),
    currency: cur,
    date: t.date,
    source: "bank",
    label: t.description || `${method} transfer`,
    reference: t.reference,
  }
}

/**
 * Inbound credits from the business ledger that can be linked to a paid invoice.
 */
export function getInboundDeposits(
  invoice: Invoice,
  creditTransactions: Transaction[],
  search?: string
): InboundDeposit[] {
  let merged: InboundDeposit[] = creditTransactions
    .map(ledgerCreditToInboundDeposit)
    .filter((d): d is InboundDeposit => d !== null)

  merged = merged.filter((d) => {
    if (d.currency !== invoice.currency) return false
    if (d.amount < invoice.total) return false
    if (search) {
      const term = search.toLowerCase()
      const matches =
        d.id.toLowerCase().includes(term) ||
        d.label.toLowerCase().includes(term) ||
        (d.reference?.toLowerCase().includes(term) ?? false)
      if (!matches) return false
    }
    return true
  })

  merged.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
  return sortDepositsByMatch(invoice, merged)
}

function findTransactionById(id: string, transactions: Transaction[]): Transaction | undefined {
  return transactions.find((x) => x.id === id)
}

export interface PaymentRecordDisplay {
  method: "easner" | "cash"
  paidAt: string
  paymentMethod?: string
  amount?: number
  currency?: string
  date?: string
  reference?: string
  description?: string
  transactionId?: string
  cashNote?: string
}

/**
 * Display info for a paid invoice. Pass `ledgerTransactions` (e.g. from GET /api/transactions)
 * to resolve Easner payment details by id.
 */
export function getPaymentRecordDisplay(
  invoice: Invoice,
  ledgerTransactions: Transaction[] = []
): PaymentRecordDisplay | null {
  const info = invoice.paymentInfo
  if (!info || invoice.status !== "paid") return null

  if (info.method === "cash") {
    return {
      method: "cash",
      paidAt: info.paidAt,
      cashNote: info.cashNote,
    }
  }

  if (info.method === "easner" && info.transactionId) {
    const txn = findTransactionById(info.transactionId, ledgerTransactions)

    if (txn) {
      const method =
        txn.type === "ach"
          ? "ACH"
          : txn.type === "wire"
            ? "Wire"
            : txn.type === "book"
              ? "Book"
              : txn.type.toUpperCase()
      return {
        method: "easner",
        paidAt: info.paidAt,
        paymentMethod: method,
        amount: Math.abs(txn.amount),
        currency: txn.displayCurrency || invoice.currency,
        date: txn.date,
        reference: txn.reference,
        description: txn.description,
        transactionId: txn.id,
      }
    }

    return {
      method: "easner",
      paidAt: info.paidAt,
      transactionId: info.transactionId,
    }
  }

  return null
}

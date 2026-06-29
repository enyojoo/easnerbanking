import type { Invoice } from "@/lib/b2b/types"
import type { InboundDeposit } from "@/lib/deposits"

export type DepositMatchConfidence = "likely" | "possible" | "none"

export function scoreDepositMatch(invoice: Invoice, deposit: InboundDeposit): DepositMatchConfidence {
  const ref = (deposit.reference ?? "").trim().toLowerCase()
  if (!ref) return "none"

  const invNum = invoice.invoiceNumber.trim().toLowerCase()
  const po = (invoice.poNumber ?? "").trim().toLowerCase()

  if (invNum && ref.includes(invNum)) return "likely"
  if (po && ref.includes(po)) return "likely"

  const invShort = invNum.replace(/^einv-/i, "")
  if (invShort && ref.includes(invShort)) return "possible"

  return "none"
}

export function sortDepositsByMatch(invoice: Invoice, deposits: InboundDeposit[]): InboundDeposit[] {
  const order: Record<DepositMatchConfidence, number> = { likely: 0, possible: 1, none: 2 }
  return [...deposits].sort((a, b) => {
    const sa = order[scoreDepositMatch(invoice, a)]
    const sb = order[scoreDepositMatch(invoice, b)]
    if (sa !== sb) return sa - sb
    return new Date(b.date).getTime() - new Date(a.date).getTime()
  })
}

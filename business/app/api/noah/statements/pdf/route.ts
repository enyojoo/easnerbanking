import { NextResponse } from "next/server"
import { requireAuth, requireNoahEnv } from "../../_helpers"
import { requireNoahVerificationApproved } from "@/lib/noah/noah-tier-guards"
import { resolveNoahAccountContext } from "@/lib/noah/resolve-account-context"
import {
  collectNoahTransactionsForRange,
  statementTxMatchesCurrency,
} from "@/lib/noah/collect-statement-transactions"
import { mapNoahTransactionToMobileItem, pickTxAmountAndCurrency } from "@/lib/noah/map-transactions"
import { generateStatementPdfBuffer } from "@/lib/generate-statement-pdf"

const MAX_RANGE_MS = 366 * 24 * 60 * 60 * 1000

function parseBody(json: unknown): { from: string; to: string; currency: string } | null {
  if (!json || typeof json !== "object") return null
  const o = json as Record<string, unknown>
  const from = typeof o.from === "string" ? o.from : ""
  const to = typeof o.to === "string" ? o.to : ""
  const currency = typeof o.currency === "string" ? o.currency.trim() : ""
  if (!from || !to || !currency) return null
  return { from, to, currency }
}

export async function POST(request: Request) {
  const mis = requireNoahEnv()
  if (mis) return mis
  const auth = await requireAuth(request)
  if ("error" in auth) return auth.error
  const { user } = auth

  const acc = await resolveNoahAccountContext(request, user.id)
  if (!acc.ok) return acc.response

  const guard = await requireNoahVerificationApproved(acc.ctx.subjectUserId, acc.ctx.scope)
  if (guard) return guard

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const parsed = parseBody(body)
  if (!parsed) {
    return NextResponse.json(
      { error: "Expected { from, to, currency } — ISO dates and account currency (USD, EUR, or GBP)" },
      { status: 400 },
    )
  }

  const fromD = new Date(parsed.from)
  const toD = new Date(parsed.to)
  if (Number.isNaN(fromD.getTime()) || Number.isNaN(toD.getTime())) {
    return NextResponse.json({ error: "Invalid from/to dates" }, { status: 400 })
  }
  if (fromD.getTime() > toD.getTime()) {
    return NextResponse.json({ error: "from must be before to" }, { status: 400 })
  }
  if (toD.getTime() - fromD.getTime() > MAX_RANGE_MS) {
    return NextResponse.json({ error: "Date range cannot exceed 366 days" }, { status: 400 })
  }

  const cur = parsed.currency.toUpperCase()
  if (cur !== "USD" && cur !== "EUR" && cur !== "GBP") {
    return NextResponse.json({ error: "currency must be USD, EUR, or GBP" }, { status: 400 })
  }
  const accountCurrency = cur as "USD" | "EUR" | "GBP"

  try {
    const txs = await collectNoahTransactionsForRange({
      noahCustomerId: acc.ctx.noahCustomerId,
      from: fromD,
      to: toD,
    })

    const filtered = txs.filter((tx) => statementTxMatchesCurrency(tx, accountCurrency))

    const rows = filtered.map((tx) => {
      const mobile = mapNoahTransactionToMobileItem(tx)
      const { amount, currency } = pickTxAmountAndCurrency(tx)
      const dir = String(mobile.direction) === "credit" ? "credit" : "debit"
      const sign = dir === "credit" ? 1 : -1
      const signed = sign * amount
      const dateStr = String(mobile.created_at ?? "").slice(0, 10)
      const desc = String(mobile.name ?? "Transaction")
      const signedFmt =
        (signed >= 0 ? "+" : "") +
        signed.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) +
        " " +
        currency

      return {
        date: dateStr,
        description: desc,
        amount: String(amount),
        signedAmount: signedFmt,
      }
    })

    const periodLabel = `${fromD.toISOString().slice(0, 10)} – ${toD.toISOString().slice(0, 10)}`

    const buf = await generateStatementPdfBuffer(
      {
        periodLabel,
        accountCurrency,
        generatedAt: new Date().toISOString().slice(0, 19).replace("T", " ") + " UTC",
        accountLabel: acc.ctx.scope === "business" ? "Business" : "Personal",
      },
      rows,
    )

    const filename = `easner-statement-${accountCurrency}-${fromD.toISOString().slice(0, 10)}-${toD.toISOString().slice(0, 10)}.pdf`

    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 400 })
  }
}

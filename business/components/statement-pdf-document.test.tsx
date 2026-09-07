import { describe, expect, it } from "vitest"
import { generateStatementPdfBuffer } from "@/lib/generate-statement-pdf"
import type { AssembledStatement, StatementActivityPdfRow } from "@/lib/statements/types"

/** A4 in points, as @react-pdf writes it into /MediaBox. */
const A4_MEDIA_BOX = "0 0 595.280029 841.890015"

const LONG_DETAILS =
  "Payout to Beneficiary Long Company Name LLC · ref 8842-XX · China bank transfer"

function rows(count: number, details?: string): StatementActivityPdfRow[] {
  return Array.from({ length: count }, (_, i) => ({
    date: "6 Sep 2026",
    type: i % 2 ? "Transfer" : "Deposit",
    details: details ?? `Payment ${i + 1}`,
    moneyIn: i % 2 ? "" : "$1,200.00",
    moneyOut: i % 2 ? "$340.50" : "",
  }))
}

function statement(overrides: Partial<AssembledStatement> = {}): AssembledStatement {
  return {
    statementId: "EST-20260907-7WC0",
    scope: "personal",
    currency: "USD",
    timeZone: "UTC",
    periodFrom: "2026-07-13",
    periodTo: "2026-09-07",
    periodLabel: "13 Jul 2026 – 7 Sep 2026",
    availableAsOf: "2026-09-07",
    availableAsOfLabel: "7 Sept 2026, 08:33 GMT+1",
    holderName: "Samuel Enyojo Odiba",
    holderEmail: "holder@example.com",
    holderFirstName: "Samuel",
    addressLabel: "Residential Address",
    address: "39 Plot, Apo Dutse, Before Cedar Crest Hospital, Abuja, FCT, 900108, Nigeria",
    bank: {
      accountNumber: "659549996956",
      routingNumber: "043087080",
      bic: "SSBAUS32",
      bankName: "SSB Bank",
      bankAddress: "8700 Perry Highway, Pittsburgh, PA, 15237, US",
    },
    moneyIn: 815.88,
    moneyOut: 609.7,
    available: 207.42,
    moneyInLabel: "$815.88",
    moneyOutLabel: "$609.70",
    availableLabel: "$207.42",
    lines: rows(0),
    ...overrides,
  }
}

type PdfPage = { mediaBox: string; hasLinkAnnotation: boolean }

/**
 * Walks /Pages → /Kids so pages come back in document order. @react-pdf emits
 * plain (uncompressed) object dictionaries, so a regex read is enough here.
 */
function readPages(pdf: Buffer): PdfPage[] {
  const raw = pdf.toString("latin1")
  const objects = new Map<string, string>()
  for (const match of raw.matchAll(/(\d+) 0 obj([\s\S]*?)endobj/g)) {
    objects.set(match[1], match[2])
  }
  const pagesTree = [...objects.values()].find((body) => body.includes("/Type /Pages"))
  const kids = pagesTree?.match(/\/Kids \[([^\]]*)\]/)?.[1] ?? ""
  const ids = [...kids.matchAll(/(\d+) 0 R/g)].map((m) => m[1])
  expect(ids.length).toBeGreaterThan(0)

  return ids.map((id) => {
    const body = objects.get(id) ?? ""
    const annotIds = [...(body.match(/\/Annots \[([^\]]*)\]/)?.[1] ?? "").matchAll(/(\d+) 0 R/g)]
    const hasLinkAnnotation = annotIds.some((m) =>
      (objects.get(m[1]) ?? "").includes("/Subtype /Link"),
    )
    return { mediaBox: body.match(/\/MediaBox \[([^\]]*)\]/)?.[1] ?? "", hasLinkAnnotation }
  })
}

describe("StatementPDFDocument", () => {
  it.each([
    ["an empty statement", statement({ lines: rows(0) })],
    ["a single line", statement({ lines: rows(1) })],
    ["one page of activity", statement({ lines: rows(9) })],
    ["a statement that spills onto a second page", statement({ lines: rows(11) })],
    ["a multi-page statement", statement({ lines: rows(44) })],
    ["a long statement", statement({ lines: rows(140) })],
    ["rows whose details wrap to two lines", statement({ lines: rows(44, LONG_DETAILS) })],
    ["rows with pathologically long details", statement({ lines: rows(6, LONG_DETAILS.repeat(6)) })],
    [
      "an account block long enough to fill page one",
      statement({
        lines: rows(20),
        address: `${"Flat 12, Very Long Street Name, District, City, Region, 900108, Nigeria ".repeat(3)}`,
        bank: {
          accountNumber: "659549996956",
          routingNumber: "043087080",
          iban: "DE89370400440532013000",
          bic: "SSBAUS32",
          bankName: "Some Rather Long Partner Bank Name, National Association",
          bankAddress: `${"8700 Perry Highway, Pittsburgh, PA, 15237, US ".repeat(3)}`,
        },
      }),
    ],
  ])("keeps every page exactly A4 for %s", async (_label, doc) => {
    const pages = readPages(await generateStatementPdfBuffer(doc))
    for (const page of pages) {
      expect(page.mediaBox).toBe(A4_MEDIA_BOX)
    }
  })

  it("prints the footer disclaimer only on the last page", async () => {
    const pages = readPages(await generateStatementPdfBuffer(statement({ lines: rows(44) })))
    expect(pages.length).toBeGreaterThan(1)
    expect(pages.map((page) => page.hasLinkAnnotation)).toEqual([
      ...pages.slice(0, -1).map(() => false),
      true,
    ])
  })

  it("prints the footer disclaimer on a single-page statement", async () => {
    const pages = readPages(await generateStatementPdfBuffer(statement({ lines: rows(3) })))
    expect(pages).toHaveLength(1)
    expect(pages[0]?.hasLinkAnnotation).toBe(true)
  })
})

import { readFileSync } from "node:fs"
import { join } from "node:path"
import * as fontkit from "fontkit"
import { describe, expect, it } from "vitest"
import { formatStatementMoney } from "./format"

/** Currency symbols Easner prints on statements (local rails + summary). */
const STATEMENT_CURRENCY_GLYPHS = ["₦", "€", "$", "£", "₹", "₩", "₱", "₪", "₣", "₵", "₽", "¥"] as const

function loadStatementFont(name: string) {
  const path = join(process.cwd(), "assets/statement-fonts", name)
  return fontkit.create(readFileSync(path))
}

describe("statement fonts", () => {
  it("Noto Sans includes glyphs for Easner currency symbols", () => {
    const font = loadStatementFont("NotoSans-Regular.ttf")
    for (const ch of STATEMENT_CURRENCY_GLYPHS) {
      expect(font.hasGlyphForCodePoint(ch.codePointAt(0)!), `missing ${ch}`).toBe(true)
    }
  })

  it("formatted local amounts use symbols covered by the statement font", () => {
    const samples = [
      formatStatementMoney(2575, "NGN"),
      formatStatementMoney(6000, "RWF"),
      formatStatementMoney(1500.9, "KES"),
      formatStatementMoney(50.5, "EUR"),
      formatStatementMoney(100, "GHS"),
    ]
    const font = loadStatementFont("NotoSans-Regular.ttf")
    for (const sample of samples) {
      for (const ch of sample) {
        const cp = ch.codePointAt(0)!
        if ((cp >= 0x30 && cp <= 0x39) || ch === "," || ch === ".") continue
        expect(font.hasGlyphForCodePoint(cp), `${sample} missing ${ch}`).toBe(true)
      }
    }
  })
})

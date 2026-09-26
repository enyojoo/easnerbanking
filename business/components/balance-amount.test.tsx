import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { BalanceAmount, balanceSizeClass, splitBalance } from "./balance-amount"

describe("splitBalance", () => {
  it("always shows two decimals and separates the cents", () => {
    expect(splitBalance(24190.32, "USD")).toMatchObject({ symbol: "$", major: "24,190", minor: ".32", text: "$24,190.32" })
    expect(splitBalance(1000, "EUR").text).toBe("€1,000.00")
  })

  it("uses a true minus", () => {
    expect(splitBalance(-5, "USD").text).toBe("−$5.00")
  })
})

describe("balanceSizeClass", () => {
  it("steps the hero down as whole digits grow", () => {
    expect(balanceSizeClass(splitBalance(248190.32, "USD"), "hero")).toContain("lg:text-6xl")
    expect(balanceSizeClass(splitBalance(12_480_190.32, "USD"), "hero")).toContain("lg:text-5xl")
    expect(balanceSizeClass(splitBalance(2_512_480_190, "USD"), "hero")).toContain("lg:text-4xl")
  })
})

describe("BalanceAmount", () => {
  it("renders the cents in a smaller span", () => {
    const html = renderToStaticMarkup(<BalanceAmount amount={24190.32} currency="USD" />)
    expect(html).toContain("$24,190")
    expect(html).toContain('text-[0.6em]')
    expect(html).toContain(".32</span>")
    expect(html).toContain('aria-label="$24,190.32"')
  })

  it("masks the figure when hidden", () => {
    const html = renderToStaticMarkup(<BalanceAmount amount={24190.32} currency="USD" hidden />)
    expect(html).toContain("••••••")
    expect(html).not.toContain("24,190")
  })
})

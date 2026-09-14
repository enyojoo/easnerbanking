import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { EASNER_BIMI_LOGO_URL } from "./email-theme"

const svgPath = join(dirname(fileURLToPath(import.meta.url)), "../../../business/public/bimi/easner.svg")

describe("BIMI SVG Tiny P/S", () => {
  const svg = readFileSync(svgPath, "utf8")

  it("declares SVG Tiny P/S 1.2 without root x/y", () => {
    expect(svg).toMatch(/<svg[^>]*version="1.2"/)
    expect(svg).toMatch(/<svg[^>]*baseProfile="tiny-ps"/)
    expect(svg).not.toMatch(/<svg[^>]*\sx=/)
    expect(svg).not.toMatch(/<svg[^>]*\sy=/)
  })

  it("is a 96px square with a solid background and company title", () => {
    expect(svg).toContain('width="96"')
    expect(svg).toContain('height="96"')
    expect(svg).toContain('viewBox="0 0 96 96"')
    expect(svg).toMatch(/<title>Easner Group, Inc\.<\/title>/)
    expect(svg).toMatch(/<rect width="96" height="96" fill="#007ACC"\/>/)
  })

  it("stays under 32KB and has no scripts, rasters, or external refs", () => {
    expect(Buffer.byteLength(svg)).toBeLessThan(32 * 1024)
    expect(svg).not.toMatch(/<script/i)
    expect(svg).not.toMatch(/<image/i)
    expect(svg).not.toMatch(/xlink:href|href="https?:/)
    expect(svg).not.toMatch(/<animate/i)
  })

  it("points BIMI DNS at the business-app HTTPS origin", () => {
    expect(EASNER_BIMI_LOGO_URL).toBe("https://business.easner.com/bimi/easner.svg")
  })
})

import { describe, expect, it } from "vitest"
import { isPublicSurfacePath, isWorkspaceSurfacePath } from "./surface-paths"

describe("surface paths", () => {
  it("treats pay.easner.com payment-link paths as public, not workspace login", () => {
    expect(isPublicSurfacePath("/acme/tuition-fall", "pay.easner.com")).toBe(true)
    expect(isWorkspaceSurfacePath("/acme/tuition-fall", "pay.easner.com")).toBe(false)
    expect(isPublicSurfacePath("/plink_550e8400e29b41d4a716446655440000", "pay.easner.com")).toBe(
      true,
    )
  })

  it("treats invoice.easner.com customer paths as public", () => {
    expect(isPublicSurfacePath("/acme/einv-1042", "invoice.easner.com")).toBe(true)
    expect(isWorkspaceSurfacePath("/acme/einv-1042", "invoice.easner.com")).toBe(false)
  })

  it("still treats operator dashboard paths as workspace on the business host", () => {
    expect(isWorkspaceSurfacePath("/links", "business.easner.com")).toBe(true)
    expect(isWorkspaceSurfacePath("/customers", "business.easner.com")).toBe(true)
    expect(isPublicSurfacePath("/invoices/abc", "business.easner.com")).toBe(false)
    expect(isPublicSurfacePath("/invoice/acme/einv-1042", "business.easner.com")).toBe(true)
    expect(isPublicSurfacePath("/pay-customer/acme/tuition-fall", "business.easner.com")).toBe(true)
  })

  it("treats customer URL shapes as public even when Host is the operator app", () => {
    expect(isPublicSurfacePath("/easner/einv-47929786ba35", "business.easner.com")).toBe(true)
    expect(isPublicSurfacePath("/easner/testing", "business.easner.com")).toBe(true)
  })
})

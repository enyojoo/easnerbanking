import { describe, expect, it } from "vitest"
import { organizationLogoStoragePath } from "@/lib/organization-logo-storage"

describe("organizationLogoStoragePath", () => {
  it("uses a stable path per organization so re-uploads replace the same object", () => {
    expect(organizationLogoStoragePath("org-1", "image/jpeg")).toBe("org-1/logo.jpg")
    expect(organizationLogoStoragePath("org-1", "image/png")).toBe("org-1/logo.png")
  })
})

import { describe, expect, it } from "vitest"
import { isOwnedKybDocumentPath } from "./kyb-document-limits"

describe("isOwnedKybDocumentPath", () => {
  const businessId = "11111111-1111-4111-8111-111111111111"
  const applicationId = "22222222-2222-4222-8222-222222222222"

  it("accepts a path under this application", () => {
    expect(
      isOwnedKybDocumentPath(
        businessId,
        applicationId,
        `${businessId}/${applicationId}/33333333-3333-4333-8333-333333333333.pdf`,
      ),
    ).toBe(true)
  })

  it("rejects other businesses, traversal, and extra segments", () => {
    expect(
      isOwnedKybDocumentPath(
        businessId,
        applicationId,
        `other/${applicationId}/33333333-3333-4333-8333-333333333333.pdf`,
      ),
    ).toBe(false)
    expect(
      isOwnedKybDocumentPath(
        businessId,
        applicationId,
        `${businessId}/${applicationId}/../secret.pdf`,
      ),
    ).toBe(false)
    expect(
      isOwnedKybDocumentPath(
        businessId,
        applicationId,
        `${businessId}/${applicationId}/nested/33333333-3333-4333-8333-333333333333.pdf`,
      ),
    ).toBe(false)
  })
})

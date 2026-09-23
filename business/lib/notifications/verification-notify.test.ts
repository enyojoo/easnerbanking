import { describe, expect, it, vi, beforeEach } from "vitest"

const mockSendEmail = vi.fn().mockResolvedValue({ success: true })
const mockResolveKybMerchantRecipients = vi.fn()
const mockResolveComplianceOpsEmail = vi.fn()
const mockKybOfficeBusinessUrl = vi.fn()
const mockKycOfficeUserUrl = vi.fn()

vi.mock("@easner/server", () => ({
  emailService: { sendEmail: (...args: unknown[]) => mockSendEmail(...args) },
  getEmailAudienceProfile: (audience: string) => ({
    dashboardUrl:
      audience === "business"
        ? "https://business.easner.com/dashboard"
        : "https://app.easner.com/user/dashboard",
  }),
}))

vi.mock("@/lib/notifications/kyb-email-recipients", () => ({
  resolveKybMerchantRecipients: (...args: unknown[]) => mockResolveKybMerchantRecipients(...args),
  resolveComplianceOpsEmail: (...args: unknown[]) => mockResolveComplianceOpsEmail(...args),
  kybOfficeBusinessUrl: (...args: unknown[]) => mockKybOfficeBusinessUrl(...args),
  kycOfficeUserUrl: (...args: unknown[]) => mockKycOfficeUserUrl(...args),
}))

const mockFrom = vi.fn()

import { notifyBusinessKybStatusChange, notifyIndividualKycStatusChange } from "./verification-notify"

describe("notifyBusinessKybStatusChange", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockResolveComplianceOpsEmail.mockReturnValue("compliance@easner.com")
    mockKybOfficeBusinessUrl.mockReturnValue("https://bk.easner.com/businesses?highlight=biz-1")
    mockResolveKybMerchantRecipients.mockResolvedValue([
      { userId: "owner-1", email: "owner@example.com", firstName: "Owner" },
      { userId: "admin-1", email: "admin@example.com", firstName: "Admin" },
    ])
    mockFrom.mockImplementation((table: string) => {
      if (table === "businesses") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: { name: "Acme Ltd" } }),
            }),
          }),
        }
      }
      if (table === "user_preferences") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: { communication_preferences: {} } }),
            }),
          }),
        }
      }
      throw new Error(`unexpected table ${table}`)
    })
  })

  it("fans out merchant KYB emails to owner and admin plus compliance ops", async () => {
    await notifyBusinessKybStatusChange(
      { from: mockFrom } as never,
      "biz-1",
      "not_started",
      "under_review",
    )

    expect(mockSendEmail).toHaveBeenCalledTimes(3)

    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "owner@example.com",
        template: "kybSubmitted",
        data: expect.objectContaining({
          businessName: "Acme Ltd",
          status: "submitted",
        }),
      }),
      expect.anything(),
    )

    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "compliance@easner.com",
        template: "kybOpsNotification",
        data: expect.objectContaining({
          businessId: "biz-1",
          businessName: "Acme Ltd",
          status: "submitted",
        }),
      }),
    )
  })

  it("sends the public reason to the business and the developer reason to compliance", async () => {
    await notifyBusinessKybStatusChange(
      { from: mockFrom } as never,
      "biz-1",
      "under_review",
      "rejected",
      ["Your information could not be verified"],
      ["Bridge cannot support this individual."],
    )

    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "owner@example.com",
        template: "kybRejected",
        data: expect.objectContaining({
          rejectionReasons: ["Your information could not be verified"],
        }),
      }),
      expect.anything(),
    )
    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "compliance@easner.com",
        template: "kybOpsNotification",
        data: expect.objectContaining({
          rejectionReasons: ["Bridge cannot support this individual."],
        }),
      }),
    )
  })

  it("skips sends when status is unchanged", async () => {
    await notifyBusinessKybStatusChange({ from: mockFrom } as never, "biz-1", "approved", "approved")
    expect(mockSendEmail).not.toHaveBeenCalled()
  })
})

describe("notifyIndividualKycStatusChange", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockResolveComplianceOpsEmail.mockReturnValue("compliance@easner.com")
    mockKycOfficeUserUrl.mockReturnValue("https://bk.easner.com/users?highlight=user-1")
    mockFrom.mockImplementation((table: string) => {
      if (table === "users") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: { email: "sam@example.com", full_name: "Sam Example" } }),
            }),
          }),
        }
      }
      if (table === "user_preferences") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: { communication_preferences: {} } }),
            }),
          }),
        }
      }
      throw new Error(`unexpected table ${table}`)
    })
  })

  it("sends user KYC email and compliance ops notification", async () => {
    await notifyIndividualKycStatusChange(
      { from: mockFrom } as never,
      "user-1",
      "not_started",
      "approved",
    )

    expect(mockSendEmail).toHaveBeenCalledTimes(2)

    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "sam@example.com",
        template: "kycApproved",
        audience: "personal",
      }),
      expect.anything(),
    )

    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "compliance@easner.com",
        template: "kycOpsNotification",
        data: expect.objectContaining({
          userId: "user-1",
          userEmail: "sam@example.com",
          userDisplayName: "Sam Example",
          status: "approved",
        }),
      }),
    )
  })
})

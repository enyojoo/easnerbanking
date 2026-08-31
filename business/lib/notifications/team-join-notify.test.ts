import { describe, expect, it, vi, beforeEach } from "vitest"

const mockSendEmail = vi.fn().mockResolvedValue({ ok: true })
const mockResolveKybMerchantRecipients = vi.fn()

vi.mock("@easner/server", () => ({
  emailService: {
    sendEmail: (...args: unknown[]) => mockSendEmail(...args),
  },
}))

vi.mock("@/lib/notifications/kyb-email-recipients", () => ({
  resolveKybMerchantRecipients: (...args: unknown[]) => mockResolveKybMerchantRecipients(...args),
}))

import { notifyTeamMemberJoined } from "./team-join-notify"

function mockAdmin(businessName: string | null) {
  return {
    from: vi.fn((table: string) => {
      if (table !== "businesses") throw new Error(`unexpected table ${table}`)
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: businessName ? { name: businessName } : null, error: null }),
          }),
        }),
      }
    }),
  }
}

describe("notifyTeamMemberJoined", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockResolveKybMerchantRecipients.mockResolvedValue([
      { userId: "owner-1", email: "owner@example.com", firstName: "Owner" },
      { userId: "admin-1", email: "admin@example.com", firstName: "Admin" },
    ])
  })

  it("emails owner and admins but not the joiner", async () => {
    await notifyTeamMemberJoined({
      admin: mockAdmin("Acme LLC") as never,
      businessId: "biz-1",
      joinerUserId: "joiner-1",
      joinerEmail: "joiner@example.com",
      joinerName: "Jamie",
      role: "admin",
    })

    expect(mockSendEmail).toHaveBeenCalledTimes(2)
    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "owner@example.com",
        template: "teamMemberJoined",
        data: expect.objectContaining({
          businessName: "Acme LLC",
          memberName: "Jamie",
          memberEmail: "joiner@example.com",
          role: "Admin",
        }),
      }),
      undefined,
    )
  })
})

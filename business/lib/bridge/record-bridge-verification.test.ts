import { beforeEach, describe, expect, it, vi } from "vitest"

const mockPersistVerificationStatus = vi.fn().mockResolvedValue(undefined)
const mockNotifyIndividual = vi.fn().mockResolvedValue(undefined)
const mockNotifyBusiness = vi.fn().mockResolvedValue(undefined)

vi.mock("@/lib/compliance/verification-store", () => ({
  persistVerificationStatus: (...args: unknown[]) => mockPersistVerificationStatus(...args),
}))

vi.mock("@/lib/notifications/verification-notify", () => ({
  notifyIndividualKycStatusChange: (...args: unknown[]) => mockNotifyIndividual(...args),
  notifyBusinessKybStatusChange: (...args: unknown[]) => mockNotifyBusiness(...args),
}))

import { recordBridgeVerificationOutcome } from "./record-bridge-verification"

function mockAdmin(row: {
  bridge_kyc_status?: string
  bridge_kyc_rejection_reasons?: unknown
  verification_rejection_reasons?: unknown
}) {
  return {
    from: vi.fn((table: string) => {
      if (table !== "users" && table !== "businesses") {
        throw new Error(`unexpected table ${table}`)
      }
      return {
        select: (cols: string) => ({
          eq: () => ({
            maybeSingle: async () => {
              if (cols.includes("bridge_kyc_rejection_reasons")) {
                return {
                  data: {
                    bridge_kyc_status: row.bridge_kyc_status ?? "not_started",
                    bridge_kyc_rejection_reasons: row.bridge_kyc_rejection_reasons ?? null,
                  },
                  error: null,
                }
              }
              return {
                data: {
                  verification_rejection_reasons: row.verification_rejection_reasons ?? null,
                },
                error: null,
              }
            },
          }),
        }),
        update: () => ({
          eq: async () => ({ error: null }),
        }),
      }
    }),
  }
}

describe("recordBridgeVerificationOutcome", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("does not re-email when already rejected and Bridge GET has no reasons", async () => {
    const admin = mockAdmin({
      bridge_kyc_status: "rejected",
      bridge_kyc_rejection_reasons: null,
      verification_rejection_reasons: [{ reason: "Your information could not be verified" }],
    })

    await recordBridgeVerificationOutcome(admin as never, {
      userId: "user-1",
      customerId: "cust-1",
      status: "rejected",
      customer: { status: "rejected" },
    })

    expect(mockNotifyIndividual).toHaveBeenCalledWith(
      expect.anything(),
      "user-1",
      "rejected",
      "rejected",
      null,
      null,
    )
    expect(mockPersistVerificationStatus).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        rejectionReasons: undefined,
      }),
    )
  })

  it("does not force a re-email when rejection has no stored reasons and GET still has none", async () => {
    const admin = mockAdmin({
      bridge_kyc_status: "rejected",
      bridge_kyc_rejection_reasons: null,
      verification_rejection_reasons: null,
    })

    await recordBridgeVerificationOutcome(admin as never, {
      userId: "user-1",
      customerId: "cust-1",
      status: "rejected",
      customer: { status: "rejected" },
    })

    expect(mockNotifyIndividual).toHaveBeenCalledWith(
      expect.anything(),
      "user-1",
      "rejected",
      "rejected",
      null,
      null,
    )
  })

  it("emails once when reasons first arrive after a bare rejection", async () => {
    const admin = mockAdmin({
      bridge_kyc_status: "rejected",
      bridge_kyc_rejection_reasons: null,
      verification_rejection_reasons: null,
    })

    await recordBridgeVerificationOutcome(admin as never, {
      userId: "user-1",
      customerId: "cust-1",
      status: "rejected",
      customer: {
        status: "rejected",
        rejection_reasons: [
          {
            reason: "Your information could not be verified",
            developer_reason: "Bridge cannot support this individual.",
          },
        ],
      },
    })

    expect(mockNotifyIndividual).toHaveBeenCalledWith(
      expect.anything(),
      "user-1",
      "not_started",
      "rejected",
      ["Your information could not be verified"],
      ["Bridge cannot support this individual."],
    )
  })

  it("emails on first transition to rejected", async () => {
    const admin = mockAdmin({
      bridge_kyc_status: "pending",
      bridge_kyc_rejection_reasons: null,
    })

    await recordBridgeVerificationOutcome(admin as never, {
      userId: "user-1",
      customerId: "cust-1",
      status: "rejected",
      customer: {
        status: "rejected",
        rejection_reasons: [{ reason: "Could not verify", developer_reason: "Internal note" }],
      },
    })

    expect(mockNotifyIndividual).toHaveBeenCalledWith(
      expect.anything(),
      "user-1",
      "under_review",
      "rejected",
      ["Could not verify"],
      ["Internal note"],
    )
  })
})

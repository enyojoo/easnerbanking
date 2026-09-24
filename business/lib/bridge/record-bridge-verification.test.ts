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
  missingBridgeReasonsColumn?: boolean
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
                if (row.missingBridgeReasonsColumn) {
                  return {
                    data: null,
                    error: {
                      code: "42703",
                      message: "column users.bridge_kyc_rejection_reasons does not exist",
                    },
                  }
                }
                return {
                  data: {
                    bridge_kyc_status: row.bridge_kyc_status ?? "not_started",
                    bridge_kyc_rejection_reasons: row.bridge_kyc_rejection_reasons ?? null,
                    verification_rejection_reasons: row.verification_rejection_reasons ?? null,
                  },
                  error: null,
                }
              }
              return {
                data: {
                  bridge_kyc_status: row.bridge_kyc_status ?? "not_started",
                  verification_rejection_reasons: row.verification_rejection_reasons ?? null,
                },
                error: null,
              }
            },
          }),
        }),
        update: () => ({
          eq: async () =>
            row.missingBridgeReasonsColumn
              ? {
                  error: {
                    code: "42703",
                    message: "column users.bridge_kyc_rejection_reasons does not exist",
                  },
                }
              : { error: null },
        }),
      }
    }),
  }
}

const rejectionPayload = {
  status: "rejected",
  rejection_reasons: [
    {
      reason: "Your information could not be verified",
      developer_reason: "Bridge cannot support this individual.",
    },
  ],
}

describe("recordBridgeVerificationOutcome", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("does not email when sync-status returns rejected and DB is already rejected", async () => {
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

    expect(mockNotifyIndividual).not.toHaveBeenCalled()
    expect(mockPersistVerificationStatus).toHaveBeenCalled()
  })

  it("does not email when already rejected even if Bridge GET still returns reasons", async () => {
    const admin = mockAdmin({
      bridge_kyc_status: "rejected",
      bridge_kyc_rejection_reasons: null,
      verification_rejection_reasons: null,
    })

    await recordBridgeVerificationOutcome(admin as never, {
      userId: "user-1",
      customerId: "cust-1",
      status: "rejected",
      customer: rejectionPayload,
    })

    expect(mockNotifyIndividual).not.toHaveBeenCalled()
  })

  it("does not email when already rejected and reasons were stored earlier", async () => {
    const admin = mockAdmin({
      bridge_kyc_status: "rejected",
      bridge_kyc_rejection_reasons: [
        {
          reason: "Your information could not be verified",
          developer_reason: "Bridge cannot support this individual.",
        },
      ],
    })

    await recordBridgeVerificationOutcome(admin as never, {
      userId: "user-1",
      customerId: "cust-1",
      status: "rejected",
      customer: rejectionPayload,
    })

    expect(mockNotifyIndividual).not.toHaveBeenCalled()
  })

  it("does not email when bridge reasons column is missing and status is unchanged", async () => {
    const admin = mockAdmin({
      bridge_kyc_status: "rejected",
      missingBridgeReasonsColumn: true,
      verification_rejection_reasons: [{ reason: "Your information could not be verified" }],
    })

    await recordBridgeVerificationOutcome(admin as never, {
      userId: "user-1",
      customerId: "cust-1",
      status: "rejected",
      customer: rejectionPayload,
    })

    expect(mockNotifyIndividual).not.toHaveBeenCalled()
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

  it("emails when moving from not_started to rejected", async () => {
    const admin = mockAdmin({
      bridge_kyc_status: "not_started",
    })

    await recordBridgeVerificationOutcome(admin as never, {
      userId: "user-1",
      customerId: "cust-1",
      status: "rejected",
      customer: rejectionPayload,
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
})

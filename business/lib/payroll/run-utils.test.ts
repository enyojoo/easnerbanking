import { describe, expect, it } from "vitest"
import { buildLineFromPerson } from "./run-utils"
import type { PayrollPerson } from "./types"

function person(overrides: Partial<PayrollPerson> = {}): PayrollPerson {
  return {
    id: "person-1",
    businessId: "business-1",
    type: "employee",
    fullName: "Amina Doe",
    email: "amina@example.com",
    country: "NG",
    defaultAmount: 125,
    payCurrency: "USD",
    payBasis: "fixed",
    hourlyRate: null,
    recipientId: "recipient-1",
    easetag: null,
    rail: "bank",
    status: "active",
    connectionId: null,
    connectionStatus: "manual",
    readinessStatus: "ready",
    identitySnapshot: {},
    metadata: {},
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  }
}

describe("buildLineFromPerson", () => {
  it("snapshots the direct provider recipient used for a manual payout", () => {
    const line = buildLineFromPerson("run-1", person())
    expect(line.recipient_id).toBe("recipient-1")
    expect(line.recipient_snapshot.recipientId).toBe("recipient-1")
  })

  it("snapshots a connected preferred receiving method", () => {
    const line = buildLineFromPerson("run-1", person({
      rail: "easetag",
      recipientId: null,
      easetag: "amina",
      metadata: {
        preferredPaymentMethod: {
          id: "method-1",
          type: "easetag",
          maskedDetails: { easetag: "@amina" },
        },
      },
    }))
    expect(line.payment_method_id).toBe("method-1")
    expect(line.payment_method_snapshot).toMatchObject({ id: "method-1", type: "easetag" })
  })
})

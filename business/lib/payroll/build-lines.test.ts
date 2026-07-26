import { describe, expect, it } from "vitest"
import { applySelectedPayrollMethod } from "./build-lines"
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
    recipientId: null,
    easetag: "amina",
    rail: "easetag",
    status: "active",
    connectionId: "connection-1",
    connectionStatus: "approved",
    readinessStatus: "ready",
    identitySnapshot: {},
    metadata: {},
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  }
}

function selectedMethod(
  type: "easetag" | "bank" | "mobile_money" | "stablecoin",
  providerRecipientId: string | null,
) {
  return {
    id: `method-${type}`,
    person_id: "person-1",
    type,
    label: type,
    masked_details: { ending: "••••1234" },
    provider_recipient_id: providerRecipientId,
    owner_type: "employee",
    connection_id: "connection-1",
  }
}

describe("applySelectedPayrollMethod", () => {
  it.each([
    ["bank", "bank"],
    ["mobile_money", "mobile"],
    ["stablecoin", "crypto"],
  ] as const)(
    "uses the selected %s method instead of the person's stale receiving rail",
    (methodType, expectedRail) => {
      const line = applySelectedPayrollMethod(
        buildLineFromPerson("run-1", person()),
        selectedMethod(methodType, "recipient-selected"),
      )

      expect(line.rail).toBe(expectedRail)
      expect(line.recipient_snapshot.recipientId).toBe("recipient-selected")
      expect(line.payment_method_snapshot).toMatchObject({
        id: `method-${methodType}`,
        type: methodType,
        providerRecipientId: "recipient-selected",
      })
    },
  )

  it("clears a stale provider recipient when EASETAG is selected", () => {
    const line = applySelectedPayrollMethod(
      buildLineFromPerson(
        "run-1",
        person({ rail: "bank", recipientId: "recipient-stale" }),
      ),
      selectedMethod("easetag", "recipient-should-not-be-used"),
    )

    expect(line.rail).toBe("easetag")
    expect(line.recipient_snapshot).toMatchObject({
      easetag: "amina",
      recipientId: null,
    })
    expect(line.payment_method_snapshot).toMatchObject({
      type: "easetag",
      providerRecipientId: null,
    })
  })
})

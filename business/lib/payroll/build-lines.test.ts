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
  accountNumber: string | null,
) {
  return {
    id: `method-${type}`,
    person_id: "person-1",
    type,
    label: type,
    currency: type === "stablecoin" ? "USDC" : "NGN",
    wallet_network: type === "stablecoin" ? "Solana" : null,
    account_number: accountNumber,
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
        selectedMethod(methodType, "destination-value"),
      )

      expect(line.rail).toBe(expectedRail)
      expect(line.recipient_snapshot.recipientId).toBeNull()
      expect(line.payment_method_snapshot).toMatchObject({
        id: `method-${methodType}`,
        type: methodType,
        payrollOwned: true,
      })
    },
  )

  it("clears a stale provider recipient when EASETAG is selected", () => {
    const line = applySelectedPayrollMethod(
      buildLineFromPerson(
        "run-1",
        person({ rail: "bank", recipientId: "recipient-stale" }),
      ),
      selectedMethod("easetag", null),
    )

    expect(line.rail).toBe("easetag")
    expect(line.recipient_snapshot).toMatchObject({
      easetag: "amina",
      recipientId: null,
    })
    expect(line.payment_method_snapshot).toMatchObject({
      type: "easetag",
    })
    expect(line.payment_method_snapshot).not.toHaveProperty("providerRecipientId")
  })

  it("marks a Payroll-owned method without creating a Send recipient reference", () => {
    const line = applySelectedPayrollMethod(
      buildLineFromPerson("run-1", person()),
      selectedMethod("bank", "0123456789"),
    )

    expect(line.recipient_snapshot.recipientId).toBeNull()
    expect(line.payment_method_snapshot).toMatchObject({
      type: "bank",
      payrollOwned: true,
    })
    expect(line.payment_method_snapshot).not.toHaveProperty("providerRecipientId")
  })
})

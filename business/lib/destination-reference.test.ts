import { describe, expect, it } from "vitest"
import {
  destinationMetadata,
  destinationReference,
  parseDestinationReference,
} from "./destination-reference"

describe("destination references", () => {
  it("keeps Send recipient metadata neutral", () => {
    expect(destinationReference("recipient", "recipient-1")).toBe("recipient:recipient-1")
    expect(destinationMetadata("recipient:recipient-1")).toEqual({
      recipient_id: "recipient-1",
    })
  })

  it("never puts a Payroll method in recipient_id", () => {
    expect(destinationReference("payroll_method", "method-1")).toBe(
      "payroll_method:method-1",
    )
    expect(destinationMetadata("payroll_method:method-1")).toEqual({
      payroll_method_id: "method-1",
    })
    expect(destinationMetadata("payroll_method:method-1")).not.toHaveProperty(
      "recipient_id",
    )
  })

  it("rejects malformed and empty references", () => {
    expect(() => parseDestinationReference("method-1")).toThrow(
      "Invalid destination reference.",
    )
    expect(() => parseDestinationReference("payroll_method:")).toThrow(
      "Invalid destination reference.",
    )
    expect(() => destinationMetadata("unknown:value")).toThrow(
      "Invalid destination reference.",
    )
  })
})

import { describe, expect, it } from "vitest"
import {
  assertSellFormSessionReady,
  buildAckFormForNextStep,
  parseNoahFormNextStep,
  sellFormSessionNeedsFinalize,
} from "@/lib/noah/finalize-sell-form-session"

describe("parseNoahFormNextStep", () => {
  it("reads Pascal-case NextStep with schema", () => {
    expect(
      parseNoahFormNextStep({
        NextStep: {
          StepID: "Cob",
          StepType: "Ack",
          Schema: { type: "object", properties: { Confirmed: { type: "boolean" } } },
        },
      }),
    ).toEqual({
      stepId: "Cob",
      stepType: "Ack",
      schema: { type: "object", properties: { Confirmed: { type: "boolean" } } },
    })
  })
})

describe("buildAckFormForNextStep", () => {
  it("fills boolean fields from schema", () => {
    expect(
      buildAckFormForNextStep({
        stepId: "Cob",
        stepType: "Ack",
        schema: {
          type: "object",
          properties: { Confirmed: { type: "boolean" } },
        },
      }),
    ).toEqual({ Confirmed: true })
  })

  it("falls back to step id object when no schema properties", () => {
    expect(
      buildAckFormForNextStep({ stepId: "Cob", stepType: "Ack" }),
    ).toEqual({ Cob: { Confirmed: true, Acknowledged: true } })
  })
})

describe("sellFormSessionNeedsFinalize", () => {
  it("returns true when NextStep is present", () => {
    expect(sellFormSessionNeedsFinalize({ NextStep: { StepID: "Cob" } })).toBe(true)
  })

  it("returns false when session is marked complete", () => {
    expect(sellFormSessionNeedsFinalize({ FormSessionComplete: true })).toBe(false)
  })
})

describe("assertSellFormSessionReady", () => {
  it("throws when Cob step is still pending", () => {
    expect(() =>
      assertSellFormSessionReady({
        formSessionId: "abc",
        raw: { NextStep: { StepID: "Cob", StepType: "Ack" } },
      }),
    ).toThrow(/pending Cob/i)
  })

  it("passes when session has no pending step", () => {
    expect(() =>
      assertSellFormSessionReady({
        formSessionId: "abc",
        raw: { FormSessionComplete: true },
      }),
    ).not.toThrow()
  })
})

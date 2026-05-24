import { describe, expect, it } from "vitest"
import {
  parseNoahFormNextStep,
  sellFormSessionNeedsFinalize,
} from "@/lib/noah/finalize-sell-form-session"

describe("parseNoahFormNextStep", () => {
  it("reads Pascal-case NextStep", () => {
    expect(
      parseNoahFormNextStep({
        NextStep: { StepID: "Cob", StepType: "Ack" },
      }),
    ).toEqual({ stepId: "Cob", stepType: "Ack" })
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

import { describe, expect, it } from "vitest"
import { sumsubReviewStatusTriggersComplete } from "./grid-sumsub-websdk"

describe("sumsubReviewStatusTriggersComplete", () => {
  it("closes only on completed, not mid-flow pending or reopen onHold", () => {
    expect(sumsubReviewStatusTriggersComplete("completed")).toBe(true)
    expect(sumsubReviewStatusTriggersComplete("onhold")).toBe(false)
    expect(sumsubReviewStatusTriggersComplete("onHold")).toBe(false)
    expect(sumsubReviewStatusTriggersComplete("pending")).toBe(false)
    expect(sumsubReviewStatusTriggersComplete("init")).toBe(false)
  })
})

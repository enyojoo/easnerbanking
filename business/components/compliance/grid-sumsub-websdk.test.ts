import { describe, expect, it } from "vitest"
import { sumsubReviewStatusTriggersComplete } from "./grid-sumsub-websdk"

describe("sumsubReviewStatusTriggersComplete", () => {
  it("closes only on completed or onhold, not mid-flow pending", () => {
    expect(sumsubReviewStatusTriggersComplete("completed")).toBe(true)
    expect(sumsubReviewStatusTriggersComplete("onhold")).toBe(true)
    expect(sumsubReviewStatusTriggersComplete("pending")).toBe(false)
    expect(sumsubReviewStatusTriggersComplete("init")).toBe(false)
  })
})

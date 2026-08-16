import { describe, expect, it } from "vitest"
import { sumsubReviewStatusTriggersComplete } from "./grid-sumsub-websdk"

describe("sumsubReviewStatusTriggersComplete", () => {
  it("re-exports complete-only close rule", () => {
    expect(sumsubReviewStatusTriggersComplete("completed")).toBe(true)
    expect(sumsubReviewStatusTriggersComplete("pending")).toBe(false)
  })
})

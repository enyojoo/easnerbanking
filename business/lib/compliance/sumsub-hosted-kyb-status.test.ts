import { describe, expect, it } from "vitest"
import {
  gridKybStatusClosesHostedFlow,
  sumsubReviewStatusShouldSyncGrid,
  sumsubReviewStatusTriggersComplete,
} from "./sumsub-hosted-kyb-status"

describe("sumsubReviewStatusTriggersComplete", () => {
  it("closes only on completed, not mid-flow pending or reopen onHold", () => {
    expect(sumsubReviewStatusTriggersComplete("completed")).toBe(true)
    expect(sumsubReviewStatusTriggersComplete("onhold")).toBe(false)
    expect(sumsubReviewStatusTriggersComplete("onHold")).toBe(false)
    expect(sumsubReviewStatusTriggersComplete("pending")).toBe(false)
    expect(sumsubReviewStatusTriggersComplete("init")).toBe(false)
  })
})

describe("sumsubReviewStatusShouldSyncGrid", () => {
  it("syncs after a step, not on SDK init", () => {
    expect(sumsubReviewStatusShouldSyncGrid("pending")).toBe(true)
    expect(sumsubReviewStatusShouldSyncGrid("completed")).toBe(true)
    expect(sumsubReviewStatusShouldSyncGrid("onHold")).toBe(true)
    expect(sumsubReviewStatusShouldSyncGrid("init")).toBe(false)
  })
})

describe("gridKybStatusClosesHostedFlow", () => {
  it("closes when Grid is in review or terminal, not mid-flow", () => {
    expect(gridKybStatusClosesHostedFlow("pending")).toBe(true)
    expect(gridKybStatusClosesHostedFlow("approved")).toBe(true)
    expect(gridKybStatusClosesHostedFlow("hold")).toBe(true)
    expect(gridKybStatusClosesHostedFlow("rejected")).toBe(true)
    expect(gridKybStatusClosesHostedFlow("in_progress")).toBe(false)
    expect(gridKybStatusClosesHostedFlow("not_started")).toBe(false)
  })
})

import { afterEach, describe, expect, it } from "vitest"
import { isGridVaSweepTreasurySender } from "./grid-va-sweep-treasury"

describe("isGridVaSweepTreasurySender", () => {
  const prev = process.env.GRID_VA_SWEEP_SOLANA_SOURCE_ADDRESSES

  afterEach(() => {
    if (prev == null) delete process.env.GRID_VA_SWEEP_SOLANA_SOURCE_ADDRESSES
    else process.env.GRID_VA_SWEEP_SOLANA_SOURCE_ADDRESSES = prev
  })

  it("recognizes the prod Grid VA sweep source", () => {
    expect(isGridVaSweepTreasurySender("E6GjrWqtzTfm5ShTCxpphBzEuNt22goKDUKspkA9tJ3U")).toBe(true)
  })

  it("does not treat a random sender as Grid", () => {
    expect(isGridVaSweepTreasurySender("4iLSnF9Joo2bj5fYSWBAqXx15nLxrQtoLWiL1fnUD4wY")).toBe(false)
  })

  it("accepts extra treasuries from env", () => {
    process.env.GRID_VA_SWEEP_SOLANA_SOURCE_ADDRESSES = "ExtraTreasury111"
    expect(isGridVaSweepTreasurySender("ExtraTreasury111")).toBe(true)
  })
})

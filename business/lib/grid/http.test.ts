import { describe, expect, it } from "vitest"
import { resolveGridListNextCursor } from "./http"

describe("resolveGridListNextCursor", () => {
  it("stops when Grid repeats the same cursor", () => {
    expect(
      resolveGridListNextCursor({
        cursor: "same",
        previousCursor: "same",
        rowCount: 1,
      }),
    ).toBeUndefined()
  })

  it("stops on an empty page", () => {
    expect(
      resolveGridListNextCursor({
        cursor: "next",
        previousCursor: undefined,
        rowCount: 0,
      }),
    ).toBeUndefined()
  })

  it("advances when the cursor changes", () => {
    expect(
      resolveGridListNextCursor({
        nextCursor: "page-2",
        previousCursor: "page-1",
        rowCount: 20,
      }),
    ).toBe("page-2")
  })
})

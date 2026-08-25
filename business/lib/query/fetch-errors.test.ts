import { describe, expect, it } from "vitest"
import {
  formatUserFacingFetchError,
  isFatalQueryFailure,
  isTransientNetworkError,
} from "./fetch-errors"

describe("fetch-errors", () => {
  it("detects transient browser network failures", () => {
    expect(isTransientNetworkError(new TypeError("Failed to fetch"))).toBe(true)
    expect(isTransientNetworkError(new Error("NetworkError when attempting to fetch resource."))).toBe(true)
    expect(isTransientNetworkError(new Error("Unauthorized"))).toBe(false)
  })

  it("formats network failures with actionable copy", () => {
    expect(formatUserFacingFetchError(new TypeError("Failed to fetch"))).toBe(
      "Connection interrupted. Check your network and try again.",
    )
  })

  it("only treats empty-cache failures as fatal", () => {
    expect(isFatalQueryFailure({ isError: true, data: undefined })).toBe(true)
    expect(isFatalQueryFailure({ isError: true, data: [] })).toBe(false)
    expect(isFatalQueryFailure({ isError: false, data: undefined })).toBe(false)
  })
})

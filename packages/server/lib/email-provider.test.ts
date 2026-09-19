import { afterEach, describe, expect, it } from "vitest"
import { resolveSesRegion } from "./email-provider"

describe("resolveSesRegion", () => {
  afterEach(() => {
    delete process.env.SES_REGION
    delete process.env.AWS_REGION
  })

  it("defaults to eu-west-2 when AWS_REGION and SES_REGION are unset", () => {
    delete process.env.SES_REGION
    delete process.env.AWS_REGION
    expect(resolveSesRegion()).toBe("eu-west-2")
  })
})

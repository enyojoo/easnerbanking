import { describe, expect, it } from "vitest"
import { NoahHttpError } from "@/lib/noah/http"
import {
  mapNoahPayoutUserError,
  parseNoahChannelLimitHints,
} from "@/lib/noah/noah-prepare-errors"

describe("mapNoahPayoutUserError", () => {
  it("maps sell invalid request without generic payout-could-not copy", () => {
    const msg = mapNoahPayoutUserError(
      new NoahHttpError("Invalid request", 400, "Invalid request", "BadRequest"),
      "sell",
    )
    expect(msg).toBe("We couldn't send this transfer, please try again.")
  })

  it("surfaces Noah detail when short and specific", () => {
    const msg = mapNoahPayoutUserError(
      new NoahHttpError("Reference is required", 400, "Reference is required"),
      "sell",
    )
    expect(msg).toContain("reference")
  })

  it("maps Noah channel policy ImplicitDeny to corridor-specific copy", () => {
    const msg = mapNoahPayoutUserError(
      new NoahHttpError(
        "Forbidden",
        403,
        "channel policy denied action `Use` for channel `ae1f871a-f2cd-5eab-84bf-5240091d9767` (ImplicitDeny)",
      ),
      "prepare",
    )
    expect(msg).toContain("verification profile")
    expect(msg).not.toContain("Check your account verification status")
  })

  it("parses channel limit hints from nested Noah error body", () => {
    const hints = parseNoahChannelLimitHints({
      Request: {
        FiatAmount: "5000000",
        FiatCurrency: "RWF",
      },
      Limits: { MinLimit: "6000", MaxLimit: "3500000" },
    })
    expect(hints).toEqual({ min: "6000", max: "3500000", currency: "RWF" })
  })

  it("maps channel limit prepare error with min/max copy", () => {
    const msg = mapNoahPayoutUserError(
      new NoahHttpError(
        "Bad Request",
        400,
        "amount outside of channel limits",
        "BadRequest",
        {
          Request: { FiatCurrency: "RWF" },
          Limits: { MinLimit: "6000", MaxLimit: "3500000" },
        },
      ),
      "quote",
    )
    expect(msg).toContain("6000")
    expect(msg).toContain("3500000")
    expect(msg).toContain("RWF")
  })

  it("maps channel limit error without hints to generic range copy", () => {
    const msg = mapNoahPayoutUserError(
      new NoahHttpError("Bad Request", 400, "amount outside of channel limits"),
      "prepare",
    )
    expect(msg).toContain("outside the allowed range")
    expect(msg).not.toContain("couldn't price")
  })
})

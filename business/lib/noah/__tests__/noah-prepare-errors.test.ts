import { describe, expect, it } from "vitest"
import { NoahHttpError } from "@/lib/noah/http"
import { mapNoahPayoutUserError } from "@/lib/noah/noah-prepare-errors"

describe("mapNoahPayoutUserError", () => {
  it("maps sell invalid request without generic payout-could-not copy", () => {
    const msg = mapNoahPayoutUserError(
      new NoahHttpError("Invalid request", 400, "Invalid request", "BadRequest"),
      "sell",
    )
    expect(msg).toBe("We couldn't send this transfer. Go back and try again.")
  })

  it("surfaces Noah detail when short and specific", () => {
    const msg = mapNoahPayoutUserError(
      new NoahHttpError("Reference is required", 400, "Reference is required"),
      "sell",
    )
    expect(msg).toContain("reference")
  })
})

import { describe, expect, it } from "vitest"
import { GridHttpError } from "./http"
import {
  isGridCustomerNotFoundError,
  parseGridCustomerListPayload,
  pickLatestGridCustomerForPlatformId,
} from "./find-grid-customer"

describe("parseGridCustomerListPayload", () => {
  it("reads data, customers, or a bare array", () => {
    expect(parseGridCustomerListPayload({ data: [{ id: "a" }] })).toEqual([{ id: "a" }])
    expect(parseGridCustomerListPayload({ customers: [{ id: "b" }] })).toEqual([{ id: "b" }])
    expect(parseGridCustomerListPayload([{ id: "c" }])).toEqual([{ id: "c" }])
  })
})

describe("pickLatestGridCustomerForPlatformId", () => {
  it("prefers the newest matching Grid id", () => {
    const picked = pickLatestGridCustomerForPlatformId(
      [
        { id: "Customer:01a007be-1a56-938e-0000-92bc32955c91", platformCustomerId: "eb_fruit" },
        { id: "Customer:01a007bf-729d-938e-0000-f3ef54fe028c", platformCustomerId: "eb_fruit" },
        { id: "Customer:01a007bf-6f70-938e-0000-eb27d94cf0a4", platformCustomerId: "eb_other" },
      ],
      "eb_fruit",
    )
    expect(picked?.id).toBe("Customer:01a007bf-729d-938e-0000-f3ef54fe028c")
  })
})

describe("isGridCustomerNotFoundError", () => {
  it("detects Grid 404 customer missing", () => {
    expect(
      isGridCustomerNotFoundError(
        new GridHttpError("Customer not found", 404, { code: "CUSTOMER_NOT_FOUND" }, "POST", "/customers"),
      ),
    ).toBe(true)
  })
})

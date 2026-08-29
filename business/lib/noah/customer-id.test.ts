import { describe, expect, it } from "vitest"
import {
  noahCustomerIdForIndividualRecreate,
  noahCustomerIdFromUserId,
  uuidFromStableSeed,
} from "./customer-id"

const USER_ID = "10819b49-d21b-416b-b1bc-39240abc5d86"

describe("noahCustomerIdForIndividualRecreate", () => {
  it("is stable for the same user and generation", () => {
    expect(noahCustomerIdForIndividualRecreate(USER_ID, 1)).toBe(
      noahCustomerIdForIndividualRecreate(USER_ID, 1),
    )
  })

  it("is not the canonical eind_ user id", () => {
    const canonical = noahCustomerIdFromUserId(USER_ID)
    const recreate = noahCustomerIdForIndividualRecreate(USER_ID, 1)
    expect(recreate).not.toBe(canonical)
    expect(recreate).toMatch(/^eind_[0-9a-f]{32}$/)
    expect(recreate).toBe(
      noahCustomerIdFromUserId(uuidFromStableSeed(`easner-noah-recreate:1:${USER_ID}`)),
    )
  })

  it("changes when generation changes", () => {
    expect(noahCustomerIdForIndividualRecreate(USER_ID, 1)).not.toBe(
      noahCustomerIdForIndividualRecreate(USER_ID, 2),
    )
  })
})

import { describe, expect, it } from "vitest"
import { canManageTeamMembers } from "@/lib/b2b/require-role"

describe("canManageTeamMembers", () => {
  it("allows Owner and Admin", () => {
    expect(canManageTeamMembers("Owner")).toBe(true)
    expect(canManageTeamMembers("Admin")).toBe(true)
  })

  it("denies Member and Viewer", () => {
    expect(canManageTeamMembers("Member")).toBe(false)
    expect(canManageTeamMembers("Viewer")).toBe(false)
  })
})

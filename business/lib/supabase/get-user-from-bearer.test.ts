import { afterEach, describe, expect, it, vi } from "vitest"
import { createBusinessAppSession } from "@/lib/app-session"
import { getUserFromBearer } from "@/lib/supabase/admin"

const SECRET = "test-business-app-session-secret-32chars"

describe("getUserFromBearer", () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it("accepts an app-session JWT as Bearer (RSC serverApiFetch)", () => {
    vi.stubEnv("BUSINESS_APP_SESSION_SECRET", SECRET)
    const { token } = createBusinessAppSession({
      id: "user-1",
      email: "owner@example.com",
      user_metadata: { name: "Ada" },
    })
    const request = new Request("https://api.easner.com/api/business/profile", {
      headers: { Authorization: `Bearer ${token}` },
    })
    return expect(getUserFromBearer(request)).resolves.toMatchObject({
      id: "user-1",
      email: "owner@example.com",
    })
  })

  it("returns null when Authorization is missing", async () => {
    const request = new Request("https://api.easner.com/api/business/profile")
    await expect(getUserFromBearer(request)).resolves.toBeNull()
  })
})

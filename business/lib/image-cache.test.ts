import { describe, expect, it } from "vitest"
import {
  bustProfileImageUrl,
  normalizeBusinessLogoUrl,
  normalizeProfileImageUrl,
} from "./image-cache"

describe("image-cache", () => {
  it("does not add a rotating time bucket to a plain storage URL", () => {
    const url = "https://cdn.example.com/avatars/user-plain/avatar.webp"
    expect(normalizeProfileImageUrl(url)).toBe(url)
  })

  it("keeps an existing bust param and reuses it after the param is stripped", () => {
    const base = "https://cdn.example.com/avatars/user-busted/avatar.webp"
    const busted = bustProfileImageUrl(base, "99")
    expect(busted).toContain("av=99")
    expect(normalizeProfileImageUrl(base)).toBe(busted)
  })

  it("versions a business logo bust independently of profile photos", () => {
    const busted = "https://cdn.example.com/org-logos/org/logo.webp?blv=7"
    expect(normalizeBusinessLogoUrl(busted)).toBe(busted)
  })
})

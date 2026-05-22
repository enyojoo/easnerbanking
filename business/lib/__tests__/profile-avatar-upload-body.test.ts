import { describe, expect, it } from "vitest"
import { parseProfileAvatarJsonBody } from "@/lib/profile-avatar-upload-body"
import { profileAvatarStoragePath } from "@/lib/profile-avatar-storage"

/** 1×1 JPEG */
const TINY_JPEG_B64 =
  "/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAn/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCwAA8A/9k="

describe("profileAvatarStoragePath", () => {
  it("uses a stable path per user so re-uploads replace the same object", () => {
    expect(profileAvatarStoragePath("user-1", "image/jpeg")).toBe("user-1/avatar.jpg")
    expect(profileAvatarStoragePath("user-1", "image/png")).toBe("user-1/avatar.png")
  })
})

describe("parseProfileAvatarJsonBody", () => {
  it("accepts base64 JPEG from mobile clients", async () => {
    const req = new Request("http://localhost/api/upload/profile-avatar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageBase64: TINY_JPEG_B64, mimeType: "image/jpeg" }),
    })
    const parsed = await parseProfileAvatarJsonBody(req)
    expect(parsed.ok).toBe(true)
    if (parsed.ok) {
      expect(parsed.contentType).toBe("image/jpeg")
      expect(parsed.bytes.length).toBeGreaterThan(0)
    }
  })

  it("rejects missing image", async () => {
    const req = new Request("http://localhost/api/upload/profile-avatar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    })
    const parsed = await parseProfileAvatarJsonBody(req)
    expect(parsed.ok).toBe(false)
    if (!parsed.ok) expect(parsed.error).toMatch(/Missing image/i)
  })
})

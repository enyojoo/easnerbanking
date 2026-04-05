/** Same rules as `packages/server/lib/username-service` — keep in sync for mobile/business parity. */

export function validateEasetag(easetag: string): { valid: boolean; error?: string } {
  if (!easetag) return { valid: false, error: "Easetag is required" }
  const cleanTag = easetag.replace(/^@/, "").toLowerCase()
  if (cleanTag.length < 4) return { valid: false, error: "Easetag must be at least 4 characters" }
  if (cleanTag.length > 10) return { valid: false, error: "Easetag must be 10 characters or less" }
  if (!/^[a-z0-9]/.test(cleanTag)) return { valid: false, error: "Easetag must start with a letter or number" }
  if (!/^[a-z0-9_-]+$/.test(cleanTag)) {
    return { valid: false, error: "Easetag can only contain letters, numbers, underscore, and hyphen" }
  }
  const reservedWords = ["admin", "support", "help", "api", "www", "mail", "root", "system"]
  if (reservedWords.includes(cleanTag)) return { valid: false, error: "This easetag is reserved" }
  return { valid: true }
}

export function normalizeEasetag(easetag: string): string {
  return easetag.replace(/^@/, "").toLowerCase()
}

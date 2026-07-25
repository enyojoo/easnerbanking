import { createHash } from "crypto"

/** Deterministic JSON for Grid idempotency keys (sorted object keys). */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value)
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`
  }
  const obj = value as Record<string, unknown>
  const keys = Object.keys(obj).sort()
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(",")}}`
}

/** Grid requires Idempotency-Key to match an identical request body. Hash the body. */
export function buildGridIdempotencyKey(prefix: string, body: unknown): string {
  const hash = createHash("sha256").update(stableStringify(body)).digest("hex").slice(0, 24)
  return `${prefix.trim()}_${hash}`
}

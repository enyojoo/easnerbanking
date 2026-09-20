import { randomBytes } from "node:crypto"

export function newPublicId(prefix: string): string {
  return `${prefix}_${randomBytes(12).toString("hex")}`
}

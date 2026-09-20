import { existsSync, readdirSync } from "node:fs"
import { join } from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"
import { leftoverApiRedirectUrl } from "@/lib/leftover-api-redirect"

const repoRoot = join(__dirname, "../../..")
const apiApp = join(repoRoot, "api/app")
const businessApi = join(repoRoot, "business/app/api")
const officeApi = join(repoRoot, "office/app/api")

/** Paths Office and first-party clients call. Handlers live on the api app. */
const firstPartyRoutesOnApi = [
  "api/auth/admin/login",
  "api/admin/audit-log",
  "api/admin/business/businesses",
  "api/admin/business/customers",
  "api/admin/business/invoices",
  "api/admin/business/terminal-sessions",
  "api/admin/checkout-fee-override",
  "api/admin/crypto-destinations",
  "api/admin/crypto-destinations/[id]",
  "api/admin/crypto-rates",
  "api/admin/crypto-rates/sync",
  "api/admin/currencies",
  "api/admin/currencies/[id]",
  "api/admin/grid-rates",
  "api/admin/grid-rates/sync",
  "api/admin/grid-schemas/sync",
  "api/admin/noah-rates",
  "api/admin/noah-rates/sync",
  "api/admin/noah/sync-user",
  "api/admin/office/businesses/[businessId]/dev-platform",
  "api/admin/office/businesses/[businessId]/kyb-documents/[documentId]",
  "api/admin/office/businesses/[businessId]/kyb-packet",
  "api/admin/office/businesses/[businessId]/members",
  "api/admin/office/businesses/[businessId]/restriction",
  "api/admin/office/businesses/[businessId]/send-compliance",
  "api/admin/office/businesses/[businessId]/send-limit-override",
  "api/admin/office/businesses/[businessId]/velocity-control",
  "api/admin/office/event-inbox",
  "api/admin/office/overview",
  "api/admin/office/statements",
  "api/admin/office/statements/[statementId]/download",
  "api/admin/office/subjects/[kind]/[id]/banking",
  "api/admin/office/subjects/[kind]/[id]/bridge-sync",
  "api/admin/office/subjects/[kind]/[id]/extra-currencies",
  "api/admin/office/subjects/[kind]/[id]/return-remaining",
  "api/admin/office/transactions",
  "api/admin/office/transactions/[transactionId]",
  "api/admin/office/users",
  "api/admin/office/users/[userId]/mfa",
  "api/admin/office/users/[userId]/reset-mfa",
  "api/admin/office/users/[userId]/restriction",
  "api/admin/office/users/[userId]/send-limit-override",
  "api/admin/office/users/[userId]/velocity-control",
  "api/admin/ops/reprovision-bank-onramp-va",
  "api/admin/payout-corridors",
  "api/admin/payout-corridors/[id]",
  "api/admin/processing-fee-overrides",
  "api/admin/processing-fee-schedule",
  "api/admin/system-settings",
  "api/admin/yc-rates",
  "api/admin/yc-rates/sync",
  "api/transfers",
]

function listRelativeFiles(dir: string, prefix = ""): string[] {
  if (!existsSync(dir)) return []
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name
    if (entry.isDirectory()) out.push(...listRelativeFiles(join(dir, entry.name), rel))
    else out.push(rel)
  }
  return out
}

describe("first-party clients hit the api app", () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it("keeps Office and Banking routes on api/, not the UI apps", () => {
    for (const path of firstPartyRoutesOnApi) {
      expect(existsSync(join(apiApp, path, "route.ts")), path).toBe(true)
    }
  })

  it("does not keep leftover Office handlers on the business UI", () => {
    expect(existsSync(join(businessApi, "admin"))).toBe(false)
    expect(listRelativeFiles(businessApi)).toEqual(["[...path]/route.ts"])
  })

  it("does not keep leftover API handlers on Office", () => {
    expect(listRelativeFiles(officeApi)).toEqual([])
  })

  it("sends leftover business /api/admin hits to the api origin", () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "https://api.easner.com")
    const dest = leftoverApiRedirectUrl(
      "https://business.easner.com/api/admin/office/subjects/user/abc/return-remaining",
      ["admin", "office", "subjects", "user", "abc", "return-remaining"],
    )
    expect(dest?.href).toBe(
      "https://api.easner.com/api/admin/office/subjects/user/abc/return-remaining",
    )
  })
})

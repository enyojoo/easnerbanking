import { beforeEach, describe, expect, it, vi } from "vitest"
import type { SupabaseClient } from "@supabase/supabase-js"

vi.mock("@/lib/turnkey/client", () => ({
  getTurnkeyApiClient: vi.fn(),
  getTurnkeyApiClientForSubOrganization: vi.fn(),
  getTurnkeyDaApiClient: vi.fn(),
  getTurnkeyDaApiClientForSubOrganization: vi.fn(),
}))

vi.mock("@/lib/turnkey/config", () => ({
  getTurnkeyOrganizationId: vi.fn(() => "parent-org"),
  isTurnkeyDaConfigured: vi.fn(() => true),
  isTurnkeyDaSendsEnabled: vi.fn(() => true),
  isTurnkeyDaSendsStrict: vi.fn(() => false),
}))

vi.mock("@/lib/turnkey/da-readiness", () => ({
  isSubOrgCustodialDaReady: vi.fn(),
  isParentOrgCustodialDaReady: vi.fn(),
  isCustodialDaMigrationComplete: vi.fn(),
}))

import {
  getTurnkeyApiClient,
  getTurnkeyApiClientForSubOrganization,
  getTurnkeyDaApiClient,
  getTurnkeyDaApiClientForSubOrganization,
} from "@/lib/turnkey/client"
import {
  isTurnkeyDaConfigured,
  isTurnkeyDaSendsEnabled,
  isTurnkeyDaSendsStrict,
} from "@/lib/turnkey/config"
import {
  isCustodialDaMigrationComplete,
  isParentOrgCustodialDaReady,
  isSubOrgCustodialDaReady,
} from "@/lib/turnkey/da-readiness"
import { resolveTurnkeySendClient } from "@/lib/turnkey/resolve-send-client"

describe("resolveTurnkeySendClient", () => {
  const rootClient = { solSendTransaction: vi.fn() }
  const daClient = { solSendTransaction: vi.fn() }

  beforeEach(() => {
    vi.mocked(getTurnkeyApiClient).mockReturnValue(rootClient as never)
    vi.mocked(getTurnkeyApiClientForSubOrganization).mockReturnValue(rootClient as never)
    vi.mocked(getTurnkeyDaApiClient).mockReturnValue(daClient as never)
    vi.mocked(getTurnkeyDaApiClientForSubOrganization).mockReturnValue(daClient as never)
    vi.mocked(isTurnkeyDaConfigured).mockReturnValue(true)
    vi.mocked(isTurnkeyDaSendsEnabled).mockReturnValue(true)
    vi.mocked(isTurnkeyDaSendsStrict).mockReturnValue(false)
    vi.mocked(isSubOrgCustodialDaReady).mockResolvedValue(false)
    vi.mocked(isParentOrgCustodialDaReady).mockResolvedValue(false)
    vi.mocked(isCustodialDaMigrationComplete).mockResolvedValue(false)
  })

  it("uses root when DA layer disabled (no DA keys / explicit off)", async () => {
    vi.mocked(isTurnkeyDaSendsEnabled).mockReturnValue(false)

    const res = await resolveTurnkeySendClient({
      scope: { kind: "sub_org", subOrganizationId: "sub-1" },
    })
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.stampingMode).toBe("root")
      expect(res.client).toBe(rootClient)
    }
  })

  it("auto-uses DA when configured and sub-org migrated", async () => {
    vi.mocked(isSubOrgCustodialDaReady).mockResolvedValue(true)

    const res = await resolveTurnkeySendClient({
      scope: { kind: "sub_org", subOrganizationId: "sub-1" },
      admin: {} as SupabaseClient,
    })
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.stampingMode).toBe("da")
      expect(res.client).toBe(daClient)
    }
  })

  it("falls back to root for unmigrated sub-org during migration (non-strict)", async () => {
    const res = await resolveTurnkeySendClient({
      scope: { kind: "sub_org", subOrganizationId: "sub-1" },
      admin: {} as SupabaseClient,
    })
    expect(res.ok).toBe(true)
    if (res.ok) expect(res.stampingMode).toBe("root")
  })

  it("fail closed when strict and sub-org not migrated", async () => {
    vi.mocked(isTurnkeyDaSendsStrict).mockReturnValue(true)

    const res = await resolveTurnkeySendClient({
      scope: { kind: "sub_org", subOrganizationId: "sub-1" },
      admin: {} as SupabaseClient,
    })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toBe("turnkey_da_not_migrated")
  })

  it("auto fail closed when migration complete and sub-org not migrated", async () => {
    vi.mocked(isCustodialDaMigrationComplete).mockResolvedValue(true)

    const res = await resolveTurnkeySendClient({
      scope: { kind: "sub_org", subOrganizationId: "sub-1" },
      admin: {} as SupabaseClient,
    })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toBe("turnkey_da_not_migrated")
  })

  it("auto-uses DA for parent when parent org ready", async () => {
    vi.mocked(isParentOrgCustodialDaReady).mockResolvedValue(true)

    const res = await resolveTurnkeySendClient({ scope: { kind: "parent" } })
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.stampingMode).toBe("da")
      expect(res.organizationId).toBe("parent-org")
    }
  })
})

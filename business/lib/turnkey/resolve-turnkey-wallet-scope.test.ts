import { describe, expect, it } from "vitest"
import { resolveTurnkeyWalletScopeFromEvent } from "./resolve-turnkey-wallet-scope"

function createAdmin(map: Record<string, { data?: unknown }>) {
  return {
    from(table: string) {
      const result = map[table] ?? { data: null }
      const q: Record<string, unknown> = {}
      for (const method of ["select", "eq", "in", "order", "limit"]) {
        q[method] = () => q
      }
      q.maybeSingle = async () => result
      q.then = (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
        Promise.resolve(result).then(resolve, reject)
      return q
    },
  }
}

describe("resolveTurnkeyWalletScopeFromEvent", () => {
  it("maps platform_customer owners to the merchant org, not owner_ref as users.id", async () => {
    const walletAccount = {
      id: "wa_1",
      wallet_owner_id: "wo_1",
      address: "So111",
      asset: "USDC",
      chain: "solana",
      associated_token_account_address: null,
    }
    const admin = createAdmin({
      wallet_accounts: { data: [walletAccount] },
      wallet_owners: { data: { owner_type: "platform_customer", owner_ref: "cus_1" } },
      platform_customers: { data: { id: "cus_1", business_id: "biz-1" } },
      users: { data: { id: "org-owner-1" } },
    })

    const scope = await resolveTurnkeyWalletScopeFromEvent(admin as never, {
      toAddress: "So111",
    })
    expect(scope).toMatchObject({
      userId: "org-owner-1",
      businessId: "biz-1",
      platformCustomerId: "cus_1",
      walletAddress: "So111",
    })
    expect(scope?.userId).not.toBe("cus_1")
  })
})

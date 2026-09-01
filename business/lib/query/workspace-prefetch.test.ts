import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { scopeKey, type BusinessScope } from "@easner/shared"
import {
  extractFiatBalanceMap,
  readWalletListDisplaySnapshot,
  readWalletListSnapshot,
  writeWalletListSnapshot,
  type WalletBalancesData,
} from "./workspace-prefetch"

const scope: BusinessScope = { kind: "business", orgId: "org_1", entityId: "ent_1" }
const storageKey = `easner_business_wallets_list_v1_${scopeKey(scope)}`

const funded: WalletBalancesData = {
  balances: { USD: "125.50", EUR: "0", source: "db" },
  available: {},
  deposits: {},
}

function installMemoryLocalStorage() {
  const store = new Map<string, string>()
  const localStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value)
    },
    removeItem: (key: string) => {
      store.delete(key)
    },
  }
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { localStorage },
  })
}

beforeEach(() => {
  installMemoryLocalStorage()
})

afterEach(() => {
  window.localStorage.removeItem(storageKey)
})

describe("wallet list snapshots", () => {
  it("extracts fiat amounts and ignores metadata keys", () => {
    expect(
      extractFiatBalanceMap({
        USD: "10",
        EUR: "2",
        GBP: "3",
        source: "db",
        detail: "wallet_balances_snapshot",
      }),
    ).toEqual({ USD: "10", EUR: "2", GBP: "3" })
  })

  it("keeps a stale snapshot for display but not as fresh query initialData", () => {
    window.localStorage.setItem(
      storageKey,
      JSON.stringify({
        ...funded,
        savedAt: Date.now() - 2 * 60 * 60 * 1000,
      }),
    )
    expect(readWalletListSnapshot(scope)).toBeUndefined()
    expect(readWalletListDisplaySnapshot(scope)?.data.balances.USD).toBe("125.50")
  })

  it("does not overwrite a funded snapshot with an authoritative zero", () => {
    writeWalletListSnapshot(scope, funded)
    writeWalletListSnapshot(scope, {
      balances: { USD: "0", EUR: "0", source: "db" },
      available: {},
      deposits: {},
    })
    expect(readWalletListDisplaySnapshot(scope)?.data.balances.USD).toBe("125.50")
  })
})

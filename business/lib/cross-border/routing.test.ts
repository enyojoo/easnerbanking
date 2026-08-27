import { describe, expect, it } from "vitest"
import type { SupabaseClient } from "@supabase/supabase-js"
import {
  resolveCrossBorderProviderForDestination,
  resolveCrossBorderSourcePayInEnabled,
} from "./routing"

describe("US cross-border", () => {
  it("does not resolve a destination provider for US USD", async () => {
    await expect(
      resolveCrossBorderProviderForDestination({} as SupabaseClient, {
        countryCode: "US",
        currencyCode: "USD",
      }),
    ).resolves.toBeNull()
  })

  it("does not treat US USD as a cross-border source", async () => {
    await expect(
      resolveCrossBorderSourcePayInEnabled({} as SupabaseClient, {
        provider: "grid",
        sourceCountry: "US",
        sourceCurrency: "USD",
      }),
    ).resolves.toBe(false)
  })
})

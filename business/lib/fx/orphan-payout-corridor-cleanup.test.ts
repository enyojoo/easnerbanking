import { describe, expect, it, vi } from "vitest"
import type { SupabaseClient } from "@supabase/supabase-js"
import { syncCorridorLiveFlagsWithEnabled } from "./orphan-payout-corridor-cleanup"

describe("syncCorridorLiveFlagsWithEnabled", () => {
  it("clears live flags on disabled rows", async () => {
    const updates: Array<{ id: string; metadata: Record<string, unknown> }> = []
    const admin = {
      from: () => {
        const api: Record<string, unknown> = {}
        api.select = () => api
        api.eq = () => api
        api.then = undefined
        api.update = (patch: { metadata: Record<string, unknown> }) => {
          const inner = {
            eq: async (_col: string, id: string) => {
              updates.push({ id, metadata: patch.metadata })
              return { error: null }
            },
          }
          return inner
        }
        return {
          ...api,
          then: undefined,
          select: () => ({
            eq: async () => ({
              data: [
                { id: "vn", metadata: { grid_send_enabled: true, grid_receive: true } },
                { id: "ok", metadata: { grid_receive: true } },
              ],
              error: null,
            }),
          }),
        }
      },
    } as unknown as SupabaseClient

    const result = await syncCorridorLiveFlagsWithEnabled(admin)
    expect(result).toEqual({ ok: true, cleared: 1 })
    expect(updates).toHaveLength(1)
    expect(updates[0]?.id).toBe("vn")
    expect(updates[0]?.metadata.grid_send_enabled).toBeUndefined()
    expect(updates[0]?.metadata.grid_receive).toBe(true)
  })
})

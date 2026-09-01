import { describe, expect, it, vi, beforeEach } from "vitest"
import type { SupabaseClient } from "@supabase/supabase-js"

const { mockNotifyApplied, mockNotifyClosed, mockNotifyLifted } = vi.hoisted(() => ({
  mockNotifyApplied: vi.fn(async () => undefined),
  mockNotifyClosed: vi.fn(async () => undefined),
  mockNotifyLifted: vi.fn(async () => undefined),
}))

vi.mock("@/lib/notifications/restriction-notify", () => ({
  notifyAccountRestrictionApplied: mockNotifyApplied,
  notifyAccountRestrictionClosed: mockNotifyClosed,
  notifyAccountRestrictionLifted: mockNotifyLifted,
}))

import {
  applyAccountRestriction,
  liftAccountRestriction,
  resolveAccountRestriction,
} from "./store"

function makeAdmin(rows: Record<string, unknown>[]) {
  const state = { rows: [...rows] }
  const terminal = {
    maybeSingle: vi.fn(async () => {
      const active = state.rows.find((r) => r.lifted_at == null)
      return { data: active ?? null, error: null }
    }),
  }
  const eqChain = {
    eq: vi.fn(() => eqChain),
    maybeSingle: terminal.maybeSingle,
  }
  const from = vi.fn((table: string) => {
    if (table !== "account_restrictions") throw new Error(`unexpected table ${table}`)
    return {
      select: vi.fn(() => ({
        is: vi.fn(() => ({
          limit: vi.fn(() => eqChain),
        })),
      })),
      insert: vi.fn((payload: Record<string, unknown>) => ({
        select: vi.fn(() => ({
          single: vi.fn(async () => {
            const row = { id: "r-new", ...payload }
            state.rows.push(row)
            return { data: row, error: null }
          }),
        })),
      })),
      update: vi.fn((patch: Record<string, unknown>) => ({
        eq: vi.fn(() => ({
          is: vi.fn(() => ({
            select: vi.fn(() => ({
              maybeSingle: vi.fn(async () => {
                const row = state.rows.find((r) => r.lifted_at == null)
                if (!row) return { data: null, error: null }
                Object.assign(row, patch)
                return { data: row, error: null }
              }),
            })),
          })),
        })),
      })),
    }
  })
  return { admin: { from } as unknown as SupabaseClient, state }
}

describe("account restriction store", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-09-01T12:00:00.000Z"))
    mockNotifyApplied.mockClear()
    mockNotifyClosed.mockClear()
    mockNotifyLifted.mockClear()
  })

  it("apply is idempotent and does not reset clock", async () => {
    const { admin, state } = makeAdmin([])
    const first = await applyAccountRestriction(admin, {
      subjectKind: "business",
      businessId: "biz-1",
      source: "office",
    })
    expect(first.applied).toBe(true)
    const originalEnds = String(first.row?.wind_down_ends_at)

    vi.setSystemTime(new Date("2026-09-01T18:00:00.000Z"))
    const second = await applyAccountRestriction(admin, {
      subjectKind: "business",
      businessId: "biz-1",
      source: "grid",
    })
    expect(second.applied).toBe(false)
    expect(second.row?.wind_down_ends_at).toBe(originalEnds)
    expect(state.rows).toHaveLength(1)
    await Promise.resolve()
    expect(mockNotifyApplied).toHaveBeenCalledTimes(1)
  })

  it("apply closed mode locks immediately", async () => {
    const { admin, state } = makeAdmin([])
    const result = await applyAccountRestriction(admin, {
      subjectKind: "business",
      businessId: "biz-1",
      source: "office",
      mode: "closed",
    })
    expect(result.applied).toBe(true)
    expect(result.row?.phase).toBe("locked")
    expect(result.row?.locked_at).toBeTruthy()
    expect(result.row?.wind_down_ends_at).toBe(result.row?.restricted_at)
    expect(state.rows).toHaveLength(1)
    await Promise.resolve()
    expect(mockNotifyClosed).toHaveBeenCalledTimes(1)
    expect(mockNotifyApplied).not.toHaveBeenCalled()
  })

  it("escalates wind-down to closed without resetting clock idempotently for wind_down re-apply", async () => {
    const { admin, state } = makeAdmin([
      {
        id: "r1",
        subject_kind: "business",
        user_id: null,
        business_id: "biz-1",
        phase: "wind_down",
        source: "office",
        restricted_at: "2026-09-01T12:00:00.000Z",
        wind_down_ends_at: "2026-09-03T12:00:00.000Z",
        locked_at: null,
        lifted_at: null,
        reason: null,
      },
    ])

    const escalated = await applyAccountRestriction(admin, {
      subjectKind: "business",
      businessId: "biz-1",
      source: "office",
      mode: "closed",
    })
    expect(escalated.applied).toBe(true)
    expect(escalated.row?.phase).toBe("locked")
    expect(escalated.row?.locked_at).toBe("2026-09-01T12:00:00.000Z")
    expect(state.rows[0]?.phase).toBe("locked")

    const again = await applyAccountRestriction(admin, {
      subjectKind: "business",
      businessId: "biz-1",
      source: "office",
      mode: "closed",
    })
    expect(again.applied).toBe(false)
    await Promise.resolve()
    expect(mockNotifyClosed).toHaveBeenCalledTimes(1)
  })

  it("auto-closes after review period and sends closed email", async () => {
    const { admin } = makeAdmin([
      {
        id: "r1",
        subject_kind: "user",
        user_id: "u1",
        business_id: null,
        phase: "wind_down",
        source: "office",
        restricted_at: "2026-09-01T12:00:00.000Z",
        wind_down_ends_at: "2026-09-08T12:00:00.000Z",
        locked_at: null,
        lifted_at: null,
        reason: null,
      },
    ])

    vi.setSystemTime(new Date("2026-09-09T12:00:00.000Z"))
    const resolved = await resolveAccountRestriction(admin, { userId: "u1", role: "individual" })
    expect(resolved.active).toBe(true)
    expect(resolved.phase).toBe("locked")
    await Promise.resolve()
    expect(mockNotifyClosed).toHaveBeenCalledTimes(1)
  })

  it("resolves locked after wind-down ends", async () => {
    const { admin } = makeAdmin([
      {
        id: "r1",
        subject_kind: "user",
        user_id: "u1",
        business_id: null,
        phase: "wind_down",
        source: "office",
        restricted_at: "2026-09-01T12:00:00.000Z",
        wind_down_ends_at: "2026-09-03T12:00:00.000Z",
        locked_at: null,
        lifted_at: null,
        reason: null,
      },
    ])

    vi.setSystemTime(new Date("2026-09-04T12:00:00.000Z"))
    const resolved = await resolveAccountRestriction(admin, { userId: "u1", role: "individual" })
    expect(resolved.active).toBe(true)
    expect(resolved.phase).toBe("locked")
  })

  it("lift clears active restriction and notifies once", async () => {
    const { admin } = makeAdmin([
      {
        id: "r1",
        subject_kind: "business",
        user_id: null,
        business_id: "biz-1",
        phase: "wind_down",
        source: "office",
        restricted_at: "2026-09-01T12:00:00.000Z",
        wind_down_ends_at: "2026-09-03T12:00:00.000Z",
        locked_at: null,
        lifted_at: null,
        reason: null,
      },
    ])

    const lifted = await liftAccountRestriction(admin, {
      businessId: "biz-1",
      role: "business",
    })
    expect(lifted.lifted).toBe(true)
    await Promise.resolve()
    expect(mockNotifyLifted).toHaveBeenCalledTimes(1)
  })
})

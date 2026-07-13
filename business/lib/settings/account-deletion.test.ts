import { describe, expect, it, vi, beforeEach } from "vitest"

const mockDeleteUser = vi.fn()
const mockPushDelete = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) })
const mockUsersDelete = vi.fn()

type UserUpdateResult = { data: { id: string } | null; error: { message: string } | null }

let userUpdateResult: UserUpdateResult = { data: { id: "user-1" }, error: null }

const mockUsersUpdate = vi.fn(() => ({
  eq: vi.fn(() => ({
    is: vi.fn(() => ({
      select: vi.fn(() => ({
        maybeSingle: vi.fn().mockImplementation(async () => userUpdateResult),
      })),
    })),
  })),
}))

const mockFrom = vi.fn((table: string) => {
  if (table === "users") {
    return {
      update: mockUsersUpdate,
      delete: mockUsersDelete,
      select: vi.fn().mockReturnValue({
        not: vi.fn().mockReturnValue({
          is: vi.fn().mockReturnValue({
            lte: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue({
                  data: [{ id: "user-1" }],
                  error: null,
                }),
              }),
            }),
          }),
        }),
      }),
    }
  }
  if (table === "user_push_devices") {
    return { delete: mockPushDelete }
  }
  return {}
})

const mockAdmin = {
  from: mockFrom,
  auth: {
    admin: {
      deleteUser: mockDeleteUser,
    },
  },
}

import {
  finalizeAccountClosure,
  getAccountDeletionState,
  processDueAccountClosures,
} from "./account-deletion"

describe("getAccountDeletionState", () => {
  it("returns closed when deleted_at is set", () => {
    expect(getAccountDeletionState({ deleted_at: "2026-01-01T00:00:00Z", deletion_scheduled_at: null })).toBe(
      "closed",
    )
  })

  it("returns pending when deletion_scheduled_at is set", () => {
    expect(getAccountDeletionState({ deleted_at: null, deletion_scheduled_at: "2026-01-08T00:00:00Z" })).toBe(
      "pending",
    )
  })

  it("returns active when neither timestamp is set", () => {
    expect(getAccountDeletionState({ deleted_at: null, deletion_scheduled_at: null })).toBe("active")
    expect(getAccountDeletionState(null)).toBe("active")
  })
})

describe("finalizeAccountClosure", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    userUpdateResult = { data: { id: "user-1" }, error: null }
    mockDeleteUser.mockResolvedValue({ error: null })
  })

  it("marks profile closed and revokes auth without deleting users row", async () => {
    const result = await finalizeAccountClosure(mockAdmin as never, "user-1", new Date("2026-01-15T12:00:00Z"))

    expect(result).toEqual({ ok: true })
    expect(mockUsersUpdate).toHaveBeenCalled()
    expect(mockUsersDelete).not.toHaveBeenCalled()
    expect(mockPushDelete).toHaveBeenCalled()
    expect(mockDeleteUser).toHaveBeenCalledWith("user-1")

    const updatePayload = mockUsersUpdate.mock.calls[0]?.[0]
    expect(updatePayload).toMatchObject({
      deleted_at: "2026-01-15T12:00:00.000Z",
      deletion_scheduled_at: null,
    })
  })

  it("treats missing auth user as success (idempotent)", async () => {
    mockDeleteUser.mockResolvedValue({ error: { message: "User not found" } })

    const result = await finalizeAccountClosure(mockAdmin as never, "user-1")

    expect(result).toEqual({ ok: true })
    expect(mockUsersDelete).not.toHaveBeenCalled()
  })

  it("returns error when auth delete fails for other reasons", async () => {
    mockDeleteUser.mockResolvedValue({ error: { message: "rate limited" } })

    const result = await finalizeAccountClosure(mockAdmin as never, "user-1")

    expect(result).toEqual({ ok: false, error: "rate limited" })
  })
})

describe("processDueAccountClosures", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    userUpdateResult = { data: { id: "user-1" }, error: null }
    mockDeleteUser.mockResolvedValue({ error: null })
  })

  it("closes due accounts and reports counts", async () => {
    const result = await processDueAccountClosures(mockAdmin as never, {
      now: new Date("2026-01-15T12:00:00Z"),
    })

    expect(result).toEqual({ processed: 1, closed: 1, failed: 0, errors: [] })
    expect(mockUsersDelete).not.toHaveBeenCalled()
  })
})

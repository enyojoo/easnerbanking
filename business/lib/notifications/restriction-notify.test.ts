import { describe, expect, it, vi, beforeEach } from "vitest"
import type { SupabaseClient } from "@supabase/supabase-js"

const mockSendEmail = vi.fn(async () => ({ success: true }))

vi.mock("@easner/server", () => ({
  emailService: { sendEmail: (...args: unknown[]) => mockSendEmail(...args) },
  getEmailAudienceProfile: (audience: string) => ({
    dashboardUrl:
      audience === "business" ? "https://business.easner.com" : "https://app.easner.com",
    fromName: "Easner",
  }),
}))

const mockKybRecipients = vi.fn(async () => [
  { userId: "owner-1", email: "owner@example.com", firstName: "Alex" },
])

vi.mock("@/lib/notifications/kyb-email-recipients", () => ({
  resolveKybMerchantRecipients: (...args: unknown[]) => mockKybRecipients(...args),
  resolveComplianceOpsEmail: () => "compliance@easner.com",
  kycOfficeUserUrl: (userId: string) => `https://bk.easner.com/users?highlight=${userId}`,
}))

vi.mock("@/lib/business/org-owner", () => ({
  resolveOrgOwnerUserId: async () => "owner-1",
}))

vi.mock("@/lib/notifications/resolve-email-audience", () => ({
  resolveEmailAudience: async () => "business",
}))

vi.mock("@/lib/notifications/user-contact", () => ({
  fetchUserEmailContact: async () => ({ email: "user@example.com", firstName: "Sam" }),
}))

import {
  notifyAccountRestrictionApplied,
  notifyAccountRestrictionClosed,
  notifyAccountRestrictionLifted,
} from "./restriction-notify"

function makeAdmin() {
  const from = vi.fn((table: string) => {
    if (table === "businesses") {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(async () => ({
              data: { legal_name: "Homeon Buildings Inc", name: "Homeon Buildings Inc" },
              error: null,
            })),
          })),
        })),
      }
    }
    if (table === "user_preferences") {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(async () => ({ data: null, error: null })),
          })),
        })),
      }
    }
    if (table === "users") {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(async () => ({ data: { full_name: "Sam User" }, error: null })),
          })),
        })),
      }
    }
    throw new Error(`unexpected table ${table}`)
  })
  return { from } as unknown as SupabaseClient
}

describe("restriction-notify", () => {
  beforeEach(() => {
    mockSendEmail.mockClear()
    mockKybRecipients.mockClear()
  })

  it("sends restricted email to business recipients and compliance ops on apply", async () => {
    const admin = makeAdmin()
    await notifyAccountRestrictionApplied(admin, {
      id: "r1",
      subject_kind: "business",
      user_id: null,
      business_id: "biz-1",
      phase: "wind_down",
      source: "grid",
      restricted_at: "2026-09-01T12:00:00.000Z",
      wind_down_ends_at: "2026-09-03T12:00:00.000Z",
      locked_at: null,
      lifted_at: null,
      created_by_admin_id: null,
      reason: "Grid compliance suspended",
      partner_event_id: null,
    })

    expect(mockKybRecipients).toHaveBeenCalledWith(admin, "biz-1")
    expect(mockSendEmail).toHaveBeenCalledTimes(2)
    expect(mockSendEmail.mock.calls[0]?.[0]).toMatchObject({
      to: "owner@example.com",
      template: "accountRestricted",
      audience: "business",
    })
    expect(mockSendEmail.mock.calls[1]?.[0]).toMatchObject({
      to: "compliance@easner.com",
      template: "accountRestrictionOpsNotification",
      data: expect.objectContaining({
        event: "applied",
        subjectLabel: "Homeon Buildings Inc",
        source: "grid",
      }),
    })
  })

  it("sends lifted email to business recipients and compliance ops on lift", async () => {
    const admin = makeAdmin()
    await notifyAccountRestrictionLifted(admin, {
      id: "r1",
      subject_kind: "business",
      user_id: null,
      business_id: "biz-1",
      phase: "wind_down",
      source: "grid",
      restricted_at: "2026-09-01T12:00:00.000Z",
      wind_down_ends_at: "2026-09-03T12:00:00.000Z",
      locked_at: null,
      lifted_at: null,
      created_by_admin_id: null,
      reason: null,
      partner_event_id: null,
    })

    expect(mockSendEmail).toHaveBeenCalledTimes(2)
    expect(mockSendEmail.mock.calls[1]?.[0]).toMatchObject({
      to: "compliance@easner.com",
      template: "accountRestrictionOpsNotification",
      data: expect.objectContaining({ event: "lifted" }),
    })
  })

  it("sends closed email to business recipients and compliance ops", async () => {
    const admin = makeAdmin()
    await notifyAccountRestrictionClosed(admin, {
      id: "r1",
      subject_kind: "business",
      user_id: null,
      business_id: "biz-1",
      phase: "locked",
      source: "office",
      restricted_at: "2026-09-01T12:00:00.000Z",
      wind_down_ends_at: "2026-09-08T12:00:00.000Z",
      locked_at: "2026-09-08T12:00:00.000Z",
      lifted_at: null,
      created_by_admin_id: null,
      reason: "Review period ended",
      partner_event_id: null,
    })

    expect(mockSendEmail).toHaveBeenCalledTimes(2)
    expect(mockSendEmail.mock.calls[0]?.[0]).toMatchObject({
      to: "owner@example.com",
      template: "accountRestrictionClosed",
    })
    expect(mockSendEmail.mock.calls[1]?.[0]).toMatchObject({
      to: "compliance@easner.com",
      template: "accountRestrictionOpsNotification",
      data: expect.objectContaining({ event: "closed" }),
    })
  })

  it("sends restricted email to individual user and compliance ops", async () => {
    const admin = makeAdmin()
    await notifyAccountRestrictionApplied(admin, {
      id: "r2",
      subject_kind: "user",
      user_id: "u1",
      business_id: null,
      phase: "wind_down",
      source: "noah",
      restricted_at: "2026-09-01T12:00:00.000Z",
      wind_down_ends_at: "2026-09-03T12:00:00.000Z",
      locked_at: null,
      lifted_at: null,
      created_by_admin_id: null,
      reason: null,
      partner_event_id: null,
    })

    expect(mockSendEmail).toHaveBeenCalledTimes(2)
    expect(mockSendEmail.mock.calls.map((call) => call[0])).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ to: "user@example.com", template: "accountRestricted" }),
        expect.objectContaining({
          to: "compliance@easner.com",
          template: "accountRestrictionOpsNotification",
        }),
      ]),
    )
  })
})

import type { SupabaseClient } from "@supabase/supabase-js"
import {
  evaluateVelocityTrigger,
  type VelocityTriggerResult,
  type WalletSendVelocityMode,
} from "@easner/shared"
import { walletSendComplianceConfig } from "./config"
import { listInboundCredits } from "./inbound-events"

export type VelocityControlRow = {
  id: string
  business_id: string
  trigger_reason: string
  inbound_total_usd: number
  max_send_usd: number
  cap_pct: number
  sent_usd: number
  mode: WalletSendVelocityMode
  triggered_at: string
  expires_at: string
  lifted_at: string | null
  metadata: Record<string, unknown>
}

export async function evaluateBusinessVelocityTrigger(
  admin: SupabaseClient,
  businessId: string,
  now = Date.now(),
): Promise<VelocityTriggerResult> {
  const cfg = walletSendComplianceConfig()
  const since = new Date(now - cfg.windowHours * 60 * 60 * 1000).toISOString()
  const credits = await listInboundCredits(admin, businessId, since)
  return evaluateVelocityTrigger(credits, now, {
    singleInboundUsd: cfg.singleInboundUsd,
    aggregate48hUsd: cfg.aggregate48hUsd,
    structuringMinCountDay: cfg.structuringMinCountDay,
    structuringMinDayUsd: cfg.structuringMinDayUsd,
    structuringMinCount48h: cfg.structuringMinCount48h,
    structuringMin48hUsd: cfg.structuringMin48hUsd,
    windowHours: cfg.windowHours,
    capPct: cfg.capPct,
  })
}

export async function loadUnliftedVelocityControl(
  admin: SupabaseClient,
  businessId: string,
): Promise<VelocityControlRow | null> {
  const { data, error } = await admin
    .from("wallet_send_velocity_controls")
    .select(
      "id,business_id,trigger_reason,inbound_total_usd,max_send_usd,cap_pct,sent_usd,mode,triggered_at,expires_at,lifted_at,metadata",
    )
    .eq("business_id", businessId)
    .is("lifted_at", null)
    .order("triggered_at", { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error || !data) return null
  return mapControlRow(data)
}

function mapControlRow(data: Record<string, unknown>): VelocityControlRow {
  return {
    id: String(data.id),
    business_id: String(data.business_id),
    trigger_reason: String(data.trigger_reason),
    inbound_total_usd: Number(data.inbound_total_usd ?? 0),
    max_send_usd: Number(data.max_send_usd ?? 0),
    cap_pct: Number(data.cap_pct ?? 20),
    sent_usd: Number(data.sent_usd ?? 0),
    mode: data.mode === "enforce" ? "enforce" : "shadow",
    triggered_at: String(data.triggered_at),
    expires_at: String(data.expires_at),
    lifted_at: data.lifted_at ? String(data.lifted_at) : null,
    metadata:
      data.metadata && typeof data.metadata === "object"
        ? (data.metadata as Record<string, unknown>)
        : {},
  }
}

export async function loadActiveVelocityControl(
  admin: SupabaseClient,
  businessId: string,
  now = Date.now(),
): Promise<VelocityControlRow | null> {
  const row = await loadUnliftedVelocityControl(admin, businessId)
  if (!row) return null
  if (Date.parse(row.expires_at) <= now) return null
  return row
}

export async function upsertVelocityControl(
  admin: SupabaseClient,
  input: {
    businessId: string
    trigger: VelocityTriggerResult
    now?: number
  },
): Promise<{ control: VelocityControlRow; created: boolean; refreshed: boolean }> {
  const cfg = walletSendComplianceConfig()
  const now = input.now ?? Date.now()
  const existing = await loadUnliftedVelocityControl(admin, input.businessId)
  const expiresAt = new Date(now + cfg.windowHours * 60 * 60 * 1000).toISOString()
  const mode: WalletSendVelocityMode = cfg.shadowMode ? "shadow" : "enforce"

  if (existing && Date.parse(existing.expires_at) > now) {
    const inboundTotalUsd = Math.max(existing.inbound_total_usd, input.trigger.inboundTotalUsd)
    const capPct = existing.cap_pct
    const maxSendUsd = Math.max(
      existing.max_send_usd,
      Math.round((inboundTotalUsd * capPct) / 100 * 100) / 100,
    )
    const { data } = await admin
      .from("wallet_send_velocity_controls")
      .update({
        inbound_total_usd: inboundTotalUsd,
        max_send_usd: maxSendUsd,
        trigger_reason: input.trigger.reason ?? existing.trigger_reason,
        expires_at: expiresAt,
        mode,
        updated_at: new Date(now).toISOString(),
        metadata: {
          ...existing.metadata,
          last_refresh_reason: input.trigger.reason,
        },
      })
      .eq("id", existing.id)
      .select(
        "id,business_id,trigger_reason,inbound_total_usd,max_send_usd,cap_pct,sent_usd,mode,triggered_at,expires_at,lifted_at,metadata",
      )
      .maybeSingle()
    const row = data
      ? {
          ...existing,
          inbound_total_usd: Number(data.inbound_total_usd ?? inboundTotalUsd),
          max_send_usd: Number(data.max_send_usd ?? maxSendUsd),
          trigger_reason: String(data.trigger_reason ?? existing.trigger_reason),
          expires_at: String(data.expires_at ?? expiresAt),
        }
      : { ...existing, inbound_total_usd: inboundTotalUsd, max_send_usd: maxSendUsd, expires_at: expiresAt }
    return { control: row, created: false, refreshed: true }
  }

  if (existing) {
    await liftVelocityControl(admin, input.businessId)
  }

  const { data, error } = await admin
    .from("wallet_send_velocity_controls")
    .insert({
      business_id: input.businessId,
      trigger_reason: input.trigger.reason,
      inbound_total_usd: input.trigger.inboundTotalUsd,
      max_send_usd: input.trigger.maxSendUsd,
      cap_pct: input.trigger.capPct,
      sent_usd: 0,
      mode,
      triggered_at: new Date(now).toISOString(),
      expires_at: expiresAt,
      metadata: {},
    })
    .select(
      "id,business_id,trigger_reason,inbound_total_usd,max_send_usd,cap_pct,sent_usd,mode,triggered_at,expires_at,lifted_at,metadata",
    )
    .maybeSingle()
  if (error || !data) {
    throw new Error(error?.message || "Failed to create velocity control")
  }
  return {
    control: {
      id: String(data.id),
      business_id: String(data.business_id),
      trigger_reason: String(data.trigger_reason),
      inbound_total_usd: Number(data.inbound_total_usd ?? 0),
      max_send_usd: Number(data.max_send_usd ?? 0),
      cap_pct: Number(data.cap_pct ?? 20),
      sent_usd: Number(data.sent_usd ?? 0),
      mode: data.mode === "enforce" ? "enforce" : "shadow",
      triggered_at: String(data.triggered_at),
      expires_at: String(data.expires_at),
      lifted_at: null,
      metadata: {},
    },
    created: true,
    refreshed: false,
  }
}

export async function appendTriggerLog(
  admin: SupabaseClient,
  input: {
    businessId: string
    controlId: string
    reason: string
    inboundTotalUsd: number
    metadata?: Record<string, unknown>
  },
): Promise<void> {
  const { error } = await admin.from("wallet_send_velocity_trigger_log").insert({
    business_id: input.businessId,
    control_id: input.controlId,
    trigger_reason: input.reason,
    inbound_total_usd: input.inboundTotalUsd,
    metadata: input.metadata ?? {},
  })
  if (error) console.error("[wallet-send-compliance] trigger log failed:", error.message)
}

export async function countRecentTriggers(
  admin: SupabaseClient,
  businessId: string,
  windowDays: number,
  now = Date.now(),
): Promise<number> {
  const since = new Date(now - windowDays * 24 * 60 * 60 * 1000).toISOString()
  const { count, error } = await admin
    .from("wallet_send_velocity_trigger_log")
    .select("id", { count: "exact", head: true })
    .eq("business_id", businessId)
    .gte("triggered_at", since)
  if (error) return 0
  return count ?? 0
}

export async function lastTriggerAt(
  admin: SupabaseClient,
  businessId: string,
): Promise<string | null> {
  const { data } = await admin
    .from("wallet_send_velocity_trigger_log")
    .select("triggered_at")
    .eq("business_id", businessId)
    .order("triggered_at", { ascending: false })
    .limit(1)
    .maybeSingle()
  return data?.triggered_at ? String(data.triggered_at) : null
}

export async function liftVelocityControl(
  admin: SupabaseClient,
  businessId: string,
  adminId?: string | null,
): Promise<{ lifted: boolean }> {
  const now = new Date().toISOString()
  const { data } = await admin
    .from("wallet_send_velocity_controls")
    .update({
      lifted_at: now,
      lifted_by_admin_id: adminId ?? null,
      updated_at: now,
    })
    .eq("business_id", businessId)
    .is("lifted_at", null)
    .select("id")
  return { lifted: Boolean(data?.length) }
}

export async function recordVelocityOutboundSpend(
  admin: SupabaseClient,
  businessId: string | null | undefined,
  amountUsd: number,
): Promise<void> {
  const id = String(businessId || "").trim()
  if (!id || !(amountUsd > 0)) return
  const control = await loadActiveVelocityControl(admin, id)
  if (!control) return
  await incrementVelocitySentUsd(admin, control.id, amountUsd)
}

export async function incrementVelocitySentUsd(
  admin: SupabaseClient,
  controlId: string,
  amountUsd: number,
): Promise<void> {
  if (!(amountUsd > 0)) return
  const { data } = await admin
    .from("wallet_send_velocity_controls")
    .select("sent_usd")
    .eq("id", controlId)
    .maybeSingle()
  const next = Number(data?.sent_usd ?? 0) + amountUsd
  await admin
    .from("wallet_send_velocity_controls")
    .update({ sent_usd: Math.round(next * 100) / 100, updated_at: new Date().toISOString() })
    .eq("id", controlId)
}

export async function loadActiveVelocityControlsByBusinessIds(
  admin: SupabaseClient,
  businessIds: string[],
  now = Date.now(),
): Promise<Map<string, VelocityControlRow>> {
  const out = new Map<string, VelocityControlRow>()
  if (businessIds.length === 0) return out
  const { data } = await admin
    .from("wallet_send_velocity_controls")
    .select(
      "id,business_id,trigger_reason,inbound_total_usd,max_send_usd,cap_pct,sent_usd,mode,triggered_at,expires_at,lifted_at,metadata",
    )
    .in("business_id", businessIds)
    .is("lifted_at", null)
    .gt("expires_at", new Date(now).toISOString())
  for (const row of data ?? []) {
    const mapped = mapControlRow(row as Record<string, unknown>)
    out.set(mapped.business_id, mapped)
  }
  return out
}

export async function applyBoostedCap(
  admin: SupabaseClient,
  control: VelocityControlRow,
  capPct: number,
): Promise<VelocityControlRow> {
  const maxSendUsd = Math.round((control.inbound_total_usd * capPct) / 100 * 100) / 100
  await admin
    .from("wallet_send_velocity_controls")
    .update({
      cap_pct: capPct,
      max_send_usd: maxSendUsd,
      trigger_reason: control.trigger_reason.includes("early_outbound")
        ? control.trigger_reason
        : `${control.trigger_reason}+early_outbound_attempt`,
      metadata: { ...control.metadata, booster: "early_outbound_attempt" },
      updated_at: new Date().toISOString(),
    })
    .eq("id", control.id)
  return {
    ...control,
    cap_pct: capPct,
    max_send_usd: maxSendUsd,
    trigger_reason: control.trigger_reason.includes("early_outbound")
      ? control.trigger_reason
      : `${control.trigger_reason}+early_outbound_attempt`,
  }
}

import { getTurnkeyApiClient } from "@/lib/turnkey/client"
import { getTurnkeyOrganizationId } from "@/lib/turnkey/config"

export type TurnkeyWebhookEndpointSummary = {
  webhookEndpointId: string
  url: string
  name: string
  isActive: boolean
  subscriptions: Array<{ eventType?: string; isActive?: boolean }>
}

type ApiClientWithWebhooks = {
  createWebhookEndpoint?: (body: {
    url: string
    name: string
    subscriptions: Array<{ eventType: string; filtersJson?: string; isActive: boolean }>
  }) => Promise<unknown>
  updateWebhookEndpoint?: (body: {
    webhookEndpointId: string
    url?: string
    isActive?: boolean
  }) => Promise<unknown>
  getWebhookEndpoints?: () => Promise<{ webhookEndpoints?: TurnkeyWebhookEndpointSummary[] }>
  listWebhookEndpoints?: () => Promise<{ webhookEndpoints?: TurnkeyWebhookEndpointSummary[] }>
}

function walkForEndpointId(value: unknown): string | null {
  if (!value || typeof value !== "object") return null
  if (Array.isArray(value)) {
    for (const item of value) {
      const id = walkForEndpointId(item)
      if (id) return id
    }
    return null
  }
  const obj = value as Record<string, unknown>
  for (const key of ["endpointId", "webhookEndpointId", "webhook_endpoint_id"]) {
    const v = obj[key]
    if (v != null && String(v).trim()) return String(v).trim()
  }
  const wh = obj.webhookEndpoint
  if (wh && typeof wh === "object") {
    const nested = walkForEndpointId(wh)
    if (nested) return nested
  }
  const result = obj.result ?? obj.activity?.result
  if (result) {
    const nested = walkForEndpointId(result)
    if (nested) return nested
  }
  for (const v of Object.values(obj)) {
    const nested = walkForEndpointId(v)
    if (nested) return nested
  }
  return null
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null
}

export function extractWebhookEndpointIdFromCreateResponse(response: unknown): string | null {
  const root = asRecord(response)
  if (root) {
    for (const key of ["endpointId", "webhookEndpointId", "webhook_endpoint_id"]) {
      const v = root[key]
      if (v != null && String(v).trim()) return String(v).trim()
    }
    const wh = asRecord(root.webhookEndpoint)
    if (wh?.endpointId != null && String(wh.endpointId).trim()) {
      return String(wh.endpointId).trim()
    }
    const result = asRecord(root.activity?.result ?? root.result)
    const created = asRecord(result?.createWebhookEndpointResult)
    const fromResult = created?.endpointId ?? asRecord(created?.webhookEndpoint)?.endpointId
    if (fromResult != null && String(fromResult).trim()) return String(fromResult).trim()
  }
  return walkForEndpointId(response)
}

export async function listTurnkeyWebhookEndpoints(): Promise<TurnkeyWebhookEndpointSummary[]> {
  const client = getTurnkeyApiClient() as ApiClientWithWebhooks | null
  if (!client) return []

  const listFn = client.getWebhookEndpoints ?? client.listWebhookEndpoints
  if (!listFn) return []

  const orgId = getTurnkeyOrganizationId()
  const res = await listFn.call(client, orgId ? { organizationId: orgId } : undefined)
  const rows = res?.webhookEndpoints ?? []
  return rows.map((row) => {
    const r = row as Record<string, unknown>
    const id = String(r.webhookEndpointId ?? r.endpointId ?? "").trim()
    return {
      webhookEndpointId: id,
      url: String(r.url ?? ""),
      name: String(r.name ?? ""),
      isActive: Boolean(r.isActive ?? true),
      subscriptions: (r.subscriptions as TurnkeyWebhookEndpointSummary["subscriptions"]) ?? [],
    }
  })
}

export async function ensureTurnkeyBalanceConfirmedWebhookEndpoint(input: {
  webhookUrl: string
  existingEndpointId?: string
}): Promise<{ endpointId: string | null; action: "created" | "updated" | "exists" | "unsupported" }> {
  const client = getTurnkeyApiClient() as ApiClientWithWebhooks | null
  if (!client?.createWebhookEndpoint) {
    return { endpointId: input.existingEndpointId || null, action: "unsupported" }
  }

  const existing = await listTurnkeyWebhookEndpoints()
  const match =
    existing.find((e) => e.webhookEndpointId === input.existingEndpointId) ||
    existing.find(
      (e) =>
        e.url === input.webhookUrl &&
        (e.subscriptions ?? []).some((s) => s.eventType === "BALANCE_CONFIRMED_UPDATES"),
    )

  if (match?.webhookEndpointId && client.updateWebhookEndpoint) {
    await client.updateWebhookEndpoint({
      webhookEndpointId: match.webhookEndpointId,
      url: input.webhookUrl,
      isActive: true,
    })
    return { endpointId: match.webhookEndpointId, action: "updated" }
  }

  if (match?.webhookEndpointId) {
    return { endpointId: match.webhookEndpointId, action: "exists" }
  }

  const response = await client.createWebhookEndpoint({
    url: input.webhookUrl,
    name: "Easner balance confirmed",
    subscriptions: [{ eventType: "BALANCE_CONFIRMED_UPDATES", isActive: true }],
  })

  const endpointId = extractWebhookEndpointIdFromCreateResponse(response)
  return { endpointId, action: "created" }
}

export function turnkeyOrganizationIdForWebhookOps(): string {
  return getTurnkeyOrganizationId()
}

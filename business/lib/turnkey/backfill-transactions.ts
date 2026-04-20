import type { SupabaseClient } from "@supabase/supabase-js"
import { getTurnkeyApiClientForSubOrganization } from "@/lib/turnkey/client"
import { applyTurnkeyWebhookSideEffects } from "@/lib/turnkey/chain-sync"

type TurnkeyClientLike = {
  getActivities?: (input: {
    organizationId: string
    status?: string[]
  }) => Promise<unknown>
}

type JsonObj = Record<string, unknown>

function asObj(v: unknown): JsonObj | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as JsonObj) : null
}

function extractActivityArray(input: unknown): JsonObj[] {
  if (Array.isArray(input)) {
    return input.filter((x): x is JsonObj => !!asObj(x))
  }
  const obj = asObj(input)
  if (!obj) return []
  const direct = obj.activities
  if (Array.isArray(direct)) return direct.filter((x): x is JsonObj => !!asObj(x))
  const nested = asObj(obj.result)?.activities
  if (Array.isArray(nested)) return nested.filter((x): x is JsonObj => !!asObj(x))
  return []
}

function toEventId(activity: JsonObj): string {
  const direct = String(activity.id ?? activity.activityId ?? "").trim()
  if (direct) return direct
  const fp = String(activity.fingerprint ?? "").trim()
  if (fp) return fp
  return `turnkey-backfill-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

export async function backfillTurnkeyHistoricalTransactions(admin: SupabaseClient): Promise<{
  ownersScanned: number
  activitiesSeen: number
  normalizedEvents: number
  ownersSkipped: number
}> {
  const { data: owners } = await admin
    .from("wallet_owners")
    .select("id, turnkey_sub_organization_id")
    .not("turnkey_sub_organization_id", "is", null)

  const ownerRows = owners || []
  let activitiesSeen = 0
  let normalizedEvents = 0
  let ownersSkipped = 0

  for (const owner of ownerRows) {
    const subOrgId = String(owner.turnkey_sub_organization_id || "").trim()
    if (!subOrgId) {
      ownersSkipped += 1
      continue
    }
    const client = getTurnkeyApiClientForSubOrganization(subOrgId) as TurnkeyClientLike | null
    if (!client || typeof client.getActivities !== "function") {
      ownersSkipped += 1
      continue
    }

    let activitiesRaw: unknown
    try {
      activitiesRaw = await client.getActivities({
        organizationId: subOrgId,
        status: ["ACTIVITY_STATUS_COMPLETED", "ACTIVITY_STATUS_PENDING"],
      })
    } catch {
      ownersSkipped += 1
      continue
    }

    const activities = extractActivityArray(activitiesRaw)
    activitiesSeen += activities.length

    for (const activity of activities) {
      const eventId = toEventId(activity)
      try {
        const normalized = await applyTurnkeyWebhookSideEffects(admin, activity, eventId)
        if (normalized) normalizedEvents += 1
      } catch {
        // Continue best-effort; upserts are idempotent by provider/provider_transaction_id.
      }
    }
  }

  return {
    ownersScanned: ownerRows.length,
    activitiesSeen,
    normalizedEvents,
    ownersSkipped,
  }
}

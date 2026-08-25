import { getTurnkeyRootApiClient } from "@/lib/turnkey/client"
import {
  getTurnkeyOrganizationId,
  getTurnkeyServerRootUserIdFromEnv,
  isTurnkeyConfigured,
} from "@/lib/turnkey/config"
import {
  buildParentSubOrgProvisioningPolicy,
  PARENT_PROVISIONING_POLICY_NAME,
} from "@/lib/turnkey/policies/parent-provisioning-policies"

type TurnkeyAdminClient = Record<string, (...args: unknown[]) => Promise<unknown>>

function asRecord(v: unknown): Record<string, unknown> {
  return v != null && typeof v === "object" ? (v as Record<string, unknown>) : {}
}

async function resolveServerRootUserId(client: TurnkeyAdminClient): Promise<string | null> {
  const fromEnv = getTurnkeyServerRootUserIdFromEnv()
  if (fromEnv) return fromEnv

  if (typeof client.getWhoami !== "function") return null
  const res = await client.getWhoami({})
  const userId = String(asRecord(res).userId ?? "").trim()
  return userId || null
}

async function listPolicyNames(client: TurnkeyAdminClient, organizationId: string): Promise<Set<string>> {
  if (typeof client.getPolicies !== "function") return new Set()
  const res = await client.getPolicies({ organizationId })
  const policies = asRecord(res).policies
  if (!Array.isArray(policies)) return new Set()
  const names = new Set<string>()
  for (const p of policies) {
    const name = String(asRecord(p).policyName ?? "").trim()
    if (name) names.add(name)
  }
  return names
}

export type EnsureParentProvisioningPolicyResult =
  | { ok: true; alreadyExists: boolean; pendingActivityId: string | null }
  | { ok: false; reason: string }

/**
 * Idempotent: ensure parent org allows the server API user to create sub-orgs without quorum.
 * Policy creation itself may need a one-time second root approver if parent quorum is 2-of-3.
 */
export async function ensureParentSubOrgProvisioningPolicy(): Promise<EnsureParentProvisioningPolicyResult> {
  if (!isTurnkeyConfigured()) return { ok: false, reason: "turnkey_disabled" }

  const client = getTurnkeyRootApiClient()
  if (!client) return { ok: false, reason: "no_client" }

  const organizationId = getTurnkeyOrganizationId()
  const adminClient = client as TurnkeyAdminClient
  const serverRootUserId = await resolveServerRootUserId(adminClient)
  if (!serverRootUserId) return { ok: false, reason: "server_root_user_unresolved" }

  const existingNames = await listPolicyNames(adminClient, organizationId)
  if (existingNames.has(PARENT_PROVISIONING_POLICY_NAME)) {
    return { ok: true, alreadyExists: true, pendingActivityId: null }
  }

  const spec = buildParentSubOrgProvisioningPolicy(serverRootUserId)
  if (typeof adminClient.createPolicy !== "function") {
    return { ok: false, reason: "createPolicy_unavailable" }
  }

  try {
    const res = await adminClient.createPolicy({
      organizationId,
      policyName: spec.policyName,
      effect: spec.effect,
      consensus: spec.consensus,
      condition: spec.condition,
      notes: spec.notes ?? "",
    })
    const r = asRecord(res)
    const activity = asRecord(r.activity)
    const pendingActivityId =
      String(r.activityId ?? r.activity_id ?? activity.id ?? activity.activityId ?? "").trim() || null
    return { ok: true, alreadyExists: false, pendingActivityId }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, reason: msg || "createPolicy_failed" }
  }
}

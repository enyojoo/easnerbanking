import {
  getTurnkeyApiKeyCurveType,
  getTurnkeyDaApiPublicKey,
  isTurnkeyDaConfigured,
  TURNKEY_CUSTODIAL_DA_USER_NAME,
} from "@/lib/turnkey/config"
import {
  buildCustodialDaPolicyPack,
  CUSTODIAL_DA_POLICY_NAMES,
  type CustodialDaPolicySpec,
} from "@/lib/turnkey/policies/custodial-da-policies"
import { listTurnkeyOrgUsers } from "@/lib/turnkey/turnkey-org-users"

type TurnkeyAdminClient = Record<string, (...args: unknown[]) => Promise<unknown>>

function asRecord(v: unknown): Record<string, unknown> {
  return v != null && typeof v === "object" ? (v as Record<string, unknown>) : {}
}

function extractUserIdFromCreateUsers(res: unknown): string | null {
  const r = asRecord(res)
  const ids = r.userIds ?? r.user_ids
  if (Array.isArray(ids) && ids.length > 0) {
    return String(ids[0] ?? "").trim() || null
  }
  const users = r.users
  if (Array.isArray(users) && users.length > 0) {
    const u = asRecord(users[0])
    return String(u.userId ?? u.user_id ?? u.id ?? "").trim() || null
  }
  return null
}

async function listPolicyNames(client: TurnkeyAdminClient, organizationId: string): Promise<Set<string>> {
  if (typeof client.getPolicies !== "function") return new Set()
  const res = await client.getPolicies({ organizationId })
  const r = asRecord(res)
  const policies = r.policies
  if (!Array.isArray(policies)) return new Set()
  const names = new Set<string>()
  for (const p of policies) {
    const row = asRecord(p)
    const name = String(row.policyName ?? row.policy_name ?? row.name ?? "").trim()
    if (name) names.add(name)
  }
  return names
}

async function createPolicy(
  client: TurnkeyAdminClient,
  organizationId: string,
  spec: CustodialDaPolicySpec,
): Promise<string | null> {
  if (typeof client.createPolicy !== "function") {
    throw new Error("Turnkey client does not expose createPolicy")
  }
  const res = await client.createPolicy({
    organizationId,
    policyName: spec.policyName,
    effect: spec.effect,
    consensus: spec.consensus,
    condition: spec.condition,
    notes: spec.notes ?? "",
  })
  return String(asRecord(res).activityId ?? asRecord(res).activity_id ?? "").trim() || null
}

export type ProvisionCustodialDaResult = {
  daUserId: string
  daUserCreated: boolean
  policiesCreated: number
  pendingActivityIds: string[]
}

/**
 * Idempotent: ensure non-root easner-da user + custodial policy pack in a Turnkey org.
 * Uses root credentials scoped to `organizationId`.
 */
export async function provisionCustodialDaForOrganization(input: {
  organizationId: string
  rootClient: TurnkeyAdminClient
}): Promise<ProvisionCustodialDaResult> {
  const organizationId = String(input.organizationId ?? "").trim()
  if (!organizationId) throw new Error("organizationId is required")
  if (!isTurnkeyDaConfigured()) {
    throw new Error("TURNKEY_DA_API_PUBLIC_KEY / TURNKEY_DA_API_PRIVATE_KEY required")
  }

  const daPublicKey = getTurnkeyDaApiPublicKey()
  const pendingActivityIds: string[] = []

  let daUserId: string | null = null
  let daUserCreated = false

  const users = await listTurnkeyOrgUsers(input.rootClient, organizationId)
  const existing = users.find((u) => u.userName === TURNKEY_CUSTODIAL_DA_USER_NAME)
  if (existing) {
    daUserId = existing.userId
  } else {
    if (typeof input.rootClient.createUsers !== "function") {
      throw new Error("Turnkey client does not expose createUsers")
    }
    const createRes = await input.rootClient.createUsers({
      organizationId,
      users: [
        {
          userName: TURNKEY_CUSTODIAL_DA_USER_NAME,
          apiKeys: [
            {
              apiKeyName: "easner-da",
              publicKey: daPublicKey,
              curveType: getTurnkeyApiKeyCurveType(),
            },
          ],
          authenticators: [],
          oauthProviders: [],
        },
      ],
    })
    daUserId = extractUserIdFromCreateUsers(createRes)
    if (!daUserId) {
      const after = await listTurnkeyOrgUsers(input.rootClient, organizationId)
      daUserId =
        after.find((u) => u.userName === TURNKEY_CUSTODIAL_DA_USER_NAME)?.userId ?? null
    }
    if (!daUserId) throw new Error("createUsers did not return easner-da user id")
    daUserCreated = true

    const activityId = String(asRecord(createRes).activityId ?? asRecord(createRes).activity_id ?? "").trim()
    if (activityId) pendingActivityIds.push(activityId)
  }

  const policyPack = buildCustodialDaPolicyPack(daUserId)
  const existingNames = await listPolicyNames(input.rootClient, organizationId)
  let policiesCreated = 0

  for (const spec of policyPack) {
    if (existingNames.has(spec.policyName)) continue
    const activityId = await createPolicy(input.rootClient, organizationId, spec)
    policiesCreated += 1
    if (activityId) pendingActivityIds.push(activityId)
    existingNames.add(spec.policyName)
  }

  for (const name of Object.values(CUSTODIAL_DA_POLICY_NAMES)) {
    if (!existingNames.has(name)) {
      throw new Error(`policy ${name} missing after provision`)
    }
  }

  return { daUserId, daUserCreated, policiesCreated, pendingActivityIds }
}

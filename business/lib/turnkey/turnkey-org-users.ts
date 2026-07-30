import { getTurnkeyOrganizationId } from "@/lib/turnkey/config"
import { getTurnkeyRootApiClient } from "@/lib/turnkey/client"
import {
  getTurnkeyParentDaUserIdFromEnv,
  TURNKEY_CUSTODIAL_DA_USER_NAME,
} from "@/lib/turnkey/config"

type TurnkeyAdminClient = Record<string, (...args: unknown[]) => Promise<unknown>>

function asRecord(v: unknown): Record<string, unknown> {
  return v != null && typeof v === "object" ? (v as Record<string, unknown>) : {}
}

export async function listTurnkeyOrgUsers(
  client: TurnkeyAdminClient,
  organizationId: string,
): Promise<Array<{ userId: string; userName: string }>> {
  if (typeof client.getUsers !== "function") return []
  const res = await client.getUsers({ organizationId })
  const users = asRecord(res).users
  if (!Array.isArray(users)) return []
  return users
    .map((u) => {
      const row = asRecord(u)
      return {
        userId: String(row.userId ?? row.user_id ?? row.id ?? "").trim(),
        userName: String(row.userName ?? row.user_name ?? "").trim(),
      }
    })
    .filter((u) => u.userId)
}

export async function findCustodialDaUserIdInOrg(organizationId: string): Promise<string | null> {
  const orgId = String(organizationId ?? "").trim()
  if (!orgId) return null
  const client = getTurnkeyRootApiClient()
  if (!client) return null
  const users = await listTurnkeyOrgUsers(
    client as TurnkeyAdminClient,
    orgId,
  )
  return users.find((u) => u.userName === TURNKEY_CUSTODIAL_DA_USER_NAME)?.userId ?? null
}

export async function resolveParentOrgCustodialDaUserId(): Promise<string | null> {
  const fromEnv = getTurnkeyParentDaUserIdFromEnv()
  if (fromEnv) return fromEnv
  return findCustodialDaUserIdInOrg(getTurnkeyOrganizationId())
}

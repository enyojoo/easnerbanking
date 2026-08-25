/**
 * Inspect parent Turnkey org: quorum, policies, pending sub-org activities.
 */
import { getTurnkeyRootApiClient } from "@/lib/turnkey/client"
import { getTurnkeyOrganizationId } from "@/lib/turnkey/config"

async function main() {
  const client = getTurnkeyRootApiClient()
  if (!client) throw new Error("no client")
  const orgId = getTurnkeyOrganizationId()

  const policies = await (client as Record<string, (...args: unknown[]) => Promise<unknown>>).getPolicies({
    organizationId: orgId,
  })
  const policyRows = (policies as { policies?: unknown[] })?.policies ?? []
  console.log(
    JSON.stringify(
      {
        policies: policyRows.map((p) => {
          const row = p as Record<string, unknown>
          return {
            name: row.policyName,
            effect: row.effect,
            consensus: row.consensus,
            condition: String(row.condition ?? "").slice(0, 200),
          }
        }),
      },
      null,
      2,
    ),
  )

  const users = await (client as Record<string, (...args: unknown[]) => Promise<unknown>>).getUsers({
    organizationId: orgId,
  })
  console.log(
    JSON.stringify(
      {
        users: ((users as { users?: unknown[] })?.users ?? []).map((u) => {
          const row = u as Record<string, unknown>
          return {
            id: row.userId,
            name: row.userName,
            apiKeys: Array.isArray(row.apiKeys) ? row.apiKeys.length : 0,
          }
        }),
      },
      null,
      2,
    ),
  )

  try {
    const quorum = await (client as Record<string, (...args: unknown[]) => Promise<unknown>>).getRootQuorum({
      organizationId: orgId,
    })
    console.log(JSON.stringify({ rootQuorum: quorum }, null, 2))
  } catch (e) {
    console.log("rootQuorum err:", e instanceof Error ? e.message : e)
  }

  try {
    const acts = await (client as Record<string, (...args: unknown[]) => Promise<unknown>>).getActivities({
      organizationId: orgId,
      paginationOptions: { limit: "20" },
    })
    const activities = (acts as { activities?: unknown[] })?.activities ?? []
    const subOrgActs = activities.filter((a) => {
      const row = a as Record<string, unknown>
      const type = String(row.type ?? "")
      return type.includes("CREATE_SUB_ORGANIZATION")
    })
    console.log(
      JSON.stringify(
        {
          subOrgActivities: subOrgActs.map((a) => {
            const row = a as Record<string, unknown>
            return {
              id: row.id,
              type: row.type,
              status: row.status,
              votes: Array.isArray(row.votes) ? row.votes.length : 0,
            }
          }),
        },
        null,
        2,
      ),
    )
  } catch (e) {
    console.log("activities err:", e instanceof Error ? e.message : e)
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})

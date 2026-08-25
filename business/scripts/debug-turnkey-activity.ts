import { getTurnkeyRootApiClient } from "@/lib/turnkey/client"

async function main() {
  const client = getTurnkeyRootApiClient()
  if (!client) throw new Error("no client")

  const activityIds = [
    "01a03ab1-3a73-797b-bdef-d40b5913eeb9", // parent provisioning policy
    "01a03aac-e457-7cde-a17b-915b1fdae7fd", // grizzly sub-org
  ]

  // Also list recent create-sub-org style activities if API supports it
  for (const id of activityIds) {
    const res = await (client as any).getActivity({ activityId: id })
    const activity = res?.activity ?? res
    console.log(
      JSON.stringify(
        {
          id: activity?.id,
          status: activity?.status,
          type: activity?.type,
          result: activity?.result,
          voteCount: activity?.votes?.length,
        },
        null,
        2,
      ),
    )
  }

  // Check if wallet_owners got updated somehow
  const { createClient } = await import("@supabase/supabase-js")
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  })
  const { data: wo } = await admin
    .from("wallet_owners")
    .select("*")
    .eq("owner_ref", "53798479-3d39-428a-bd22-0b48fc3792a2")
    .maybeSingle()
  console.log("wallet_owner", wo)

  // Check parent org users / policies briefly
  try {
    const whoami = await (client as any).getWhoami?.({})
    console.log("whoami", JSON.stringify(whoami, null, 2)?.slice(0, 1500))
  } catch (e) {
    console.log("whoami err", e instanceof Error ? e.message : e)
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})

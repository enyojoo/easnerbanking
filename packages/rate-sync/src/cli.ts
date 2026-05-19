import { syncExchangeRatesFromModel } from "./sync-to-supabase"

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !key) {
  console.error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required")
  process.exit(1)
}

const dryRun = process.argv.includes("--dry-run")

void (async () => {
  const result = await syncExchangeRatesFromModel({
    supabaseUrl: url,
    serviceRoleKey: key,
    dryRun,
  })
  console.log(
    JSON.stringify(
      {
        dryRun,
        updated: result.updated,
        skipped: result.skipped,
        sample: result.pairs.slice(0, 5),
      },
      null,
      2,
    ),
  )
})()

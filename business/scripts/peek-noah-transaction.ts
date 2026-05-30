import { noahFetch } from "../lib/noah/http"

const id = process.argv[2]?.trim()
if (!id) {
  console.error("Usage: peek-noah-transaction.ts <TransactionID>")
  process.exit(1)
}

async function main() {
  const tx = await noahFetch<Record<string, unknown>>({
    method: "GET",
    path: `/transactions/${id}`,
  })
  console.log(JSON.stringify(tx, null, 2))
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})

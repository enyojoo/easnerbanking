import { yellowcardFetch } from "../lib/yellowcard/http"

const id = process.argv[2]?.trim()
const sequenceId = process.argv[3]?.trim()

async function main() {
  if (id) {
    console.log("=== GET /send/" + id + " ===")
    console.log(JSON.stringify(await yellowcardFetch({ method: "GET", path: `/send/${id}` }), null, 2))
  }
  if (sequenceId) {
    console.log("=== GET /send/sequence-id/" + sequenceId + " ===")
    console.log(
      JSON.stringify(
        await yellowcardFetch({ method: "GET", path: `/send/sequence-id/${encodeURIComponent(sequenceId)}` }),
        null,
        2,
      ),
    )
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

import { getTurnkeyApiClient } from "../lib/turnkey/client"
import { getTurnkeyOrganizationId } from "../lib/turnkey/config"
import {
  interpretTurnkeyGetSendTransactionStatus,
  pollUntilTurnkeySendTerminal,
} from "../lib/turnkey/sol-send-polling"

const sendId = process.argv[2]
if (!sendId) {
  console.error("usage: poll-turnkey-send.ts <sendStatusId>")
  process.exit(1)
}

async function main() {
  const orgId = getTurnkeyOrganizationId()
  const client = getTurnkeyApiClient()
  if (!client) throw new Error("turnkey_not_configured")

  const terminal = await pollUntilTurnkeySendTerminal(client, orgId, sendId, {
    timeoutMs: 120_000,
    intervalMs: 2_000,
  })
  console.log(JSON.stringify(terminal, null, 2))
  if (terminal) {
    console.log("interpreted", interpretTurnkeyGetSendTransactionStatus(terminal))
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

import { createHash } from "crypto"
import type { RecipientSellPrepareRow } from "@/lib/terminal/recipient-sell-prepare"
import { buildRecipientSnapshotFromRow } from "@/lib/noah/build-payout-execute-snapshot"

export function hashRecipientSnapshot(row: RecipientSellPrepareRow): string {
  const snapshot = buildRecipientSnapshotFromRow(row)
  return createHash("sha256").update(JSON.stringify(snapshot)).digest("hex")
}

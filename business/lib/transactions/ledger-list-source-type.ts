import { isBankOnrampDepositFlow } from "@easner/shared"

/** Infer list `source_type` from denormalized metadata (no `payload` required). */
export function inferLedgerListSourceType(
  meta: Record<string, unknown> | null | undefined,
): string | undefined {
  if (!meta) return undefined
  if (String(meta.source ?? "").toLowerCase() === "easetag_p2p") return "easetag_p2p"
  const explicit = String(meta.source_type ?? "").trim()
  if (explicit) return explicit
  if (isBankOnrampDepositFlow(meta)) return "virtual_account"
  if (meta.noah_fiat_deposit_id || meta.flow === "bank_onramp") return "virtual_account"
  const src = String(meta.source ?? "").toLowerCase()
  if (
    src === "turnkey_webhook" ||
    src === "turnkey_chain_sync" ||
    src === "turnkey_balance_webhook" ||
    src === "helius_webhook"
  ) {
    return "liquidation_address"
  }
  return undefined
}

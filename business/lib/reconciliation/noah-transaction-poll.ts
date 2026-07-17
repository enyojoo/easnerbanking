import { noahFetch, NoahHttpError } from "@/lib/noah/http"
import { pendingGlobalPayoutProviderTransactionId } from "@/lib/noah/global-payout-ledger"

type TxListResp = { Items?: Array<Record<string, unknown>>; PageToken?: string }

/** Wrap a Noah transaction API object as a webhook envelope for idempotent replay. */
export function buildNoahTransactionWebhookEnvelope(
  txData: Record<string, unknown>,
): Record<string, unknown> {
  const occurred =
    txData.Updated ??
    txData.Created ??
    txData.Occurred ??
    new Date().toISOString()
  return {
    EventType: "Transaction",
    Occurred: occurred,
    Data: txData,
  }
}

export async function fetchNoahTransactionById(
  transactionId: string,
): Promise<Record<string, unknown> | null> {
  const id = String(transactionId || "").trim()
  if (!id) return null
  try {
    return await noahFetch<Record<string, unknown>>({
      method: "GET",
      path: `/transactions/${encodeURIComponent(id)}`,
    })
  } catch (e) {
    if (e instanceof NoahHttpError && e.status === 404) return null
    throw e
  }
}

/** Scan recent Noah transactions for a global payout ExternalID (easner_payout_id). */
export async function findNoahTransactionByExternalId(
  externalId: string,
  opts?: { maxPages?: number; pageSize?: number },
): Promise<Record<string, unknown> | null> {
  const key = String(externalId || "").trim()
  if (!key) return null

  const maxPages = opts?.maxPages ?? 5
  const pageSize = opts?.pageSize ?? 50
  let token: string | undefined

  for (let page = 0; page < maxPages; page++) {
    const data = await noahFetch<TxListResp>({
      method: "GET",
      path: "/transactions",
      query: {
        PageSize: pageSize,
        SortDirection: "DESC",
        ...(token ? { PageToken: token } : {}),
      },
    })
    for (const tx of data.Items ?? []) {
      const ext = String(tx.ExternalID ?? tx.externalID ?? tx.ExternalId ?? "").trim()
      if (ext === key) return tx
    }
    token = data.PageToken ? String(data.PageToken) : undefined
    if (!token) break
  }
  return null
}

export function readNoahTransactionIdFromPendingRow(input: {
  providerTransactionId: string | null
  metadata: Record<string, unknown>
}): string | null {
  const fromMeta = String(input.metadata.noah_transaction_id ?? "").trim()
  if (fromMeta) return fromMeta

  const ptid = String(input.providerTransactionId ?? "").trim()
  if (!ptid || ptid.startsWith("global_payout_pending:")) return null
  return ptid
}

export function readEasnerPayoutIdFromRow(metadata: Record<string, unknown>): string | null {
  const id = String(metadata.easner_payout_id ?? "").trim()
  if (id) return id
  const ptid = String(metadata.provider_transaction_id ?? "").trim()
  if (ptid.startsWith("global_payout_pending:")) {
    return ptid.slice("global_payout_pending:".length)
  }
  return null
}

export { pendingGlobalPayoutProviderTransactionId }

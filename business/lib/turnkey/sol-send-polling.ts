/** Turnkey Solana send status parsing/polling – no ledger or Next.js server-only deps (CLI-safe). */
export type TurnkeyClientLike = Record<string, (...args: any[]) => Promise<any>>

export function asRecord(v: unknown): Record<string, unknown> | null {
  if (v && typeof v === "object" && !Array.isArray(v)) return v as Record<string, unknown>
  return null
}

const DEEP_SEARCH_SKIP = new Set(["votes", "intent"])

function takeSendStatusId(v: unknown): string | null {
  const s = String(v ?? "").trim()
  if (!s) return null
  // Turnkey may set `sendTransactionStatusId` to the activity fingerprint (`sha256:…`); that value is valid for `getSendTransactionStatus`.
  return s
}

function normalizeActivityResult(result: unknown): Record<string, unknown> | null {
  if (Array.isArray(result) && result.length === 1) {
    return normalizeActivityResult(result[0])
  }
  const obj = asRecord(result)
  if (obj) return obj
  if (typeof result === "string") {
    const t = result.trim()
    if (!t.startsWith("{") && !t.startsWith("[")) return null
    try {
      return normalizeActivityResult(JSON.parse(t) as unknown)
    } catch {
      return null
    }
  }
  return null
}

function unwrapSolSendTransactionResultPayload(raw: unknown): Record<string, unknown> | null {
  if (Array.isArray(raw)) {
    for (const item of raw) {
      const hit = unwrapSolSendTransactionResultPayload(item)
      if (hit) return hit
    }
    return null
  }
  if (typeof raw === "string") {
    const t = raw.trim()
    if (!t.startsWith("{") && !t.startsWith("[")) return null
    try {
      return unwrapSolSendTransactionResultPayload(JSON.parse(t) as unknown)
    } catch {
      return null
    }
  }
  return asRecord(raw)
}

function extractSendStatusIdFromAppProofs(activity: Record<string, unknown>): string | null {
  const proofs = activity.appProofs
  if (!Array.isArray(proofs)) return null
  for (const p of proofs) {
    const pr = asRecord(p)
    const raw = pr?.proofPayload
    if (typeof raw !== "string") continue
    if (!raw.includes("sendTransaction") && !raw.includes("send_transaction")) continue
    try {
      const id = deepFindSendTransactionStatusId(JSON.parse(raw) as unknown, 0)
      if (id) return id
    } catch {
      /* ignore */
    }
  }
  return null
}

/** Depth-first: Turnkey sometimes nests `sendTransactionStatusId` under protobuf/JSON shapes we do not enumerate. */
function deepFindSendTransactionStatusId(node: unknown, depth: number): string | null {
  if (depth > 16) return null
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = deepFindSendTransactionStatusId(item, depth + 1)
      if (found) return found
    }
    return null
  }
  if (typeof node === "string") {
    const t = node.trim()
    if (
      t.length > 2 &&
      t.length < 200_000 &&
      (t.includes("sendTransactionStatusId") || t.includes("send_transaction_status_id"))
    ) {
      try {
        const id = deepFindSendTransactionStatusId(JSON.parse(t) as unknown, depth + 1)
        if (id) return id
      } catch {
        /* ignore */
      }
    }
    return null
  }
  const rec = asRecord(node)
  if (!rec) return null
  const hit = takeSendStatusId(rec.sendTransactionStatusId ?? rec.send_transaction_status_id)
  if (hit) return hit
  for (const [k, v] of Object.entries(rec)) {
    if (DEEP_SEARCH_SKIP.has(k)) continue
    const found = deepFindSendTransactionStatusId(v, depth + 1)
    if (found) return found
  }
  return null
}

function activityResultKeySummary(response: Record<string, unknown>): string {
  const act = asRecord(response.activity)
  if (!act) return "no_activity"
  const raw = act.result
  if (raw == null) return "activity.result=null"
  if (typeof raw === "string") return `activity.result_is_string(len=${raw.length})`
  const res = asRecord(raw)
  if (!res) return "activity.result_non_object"
  return `activity.result_keys=${Object.keys(res).join(",")}`
}

/** Reads `sendTransactionStatusId` from SDK-merged fields or `activity.result` (including fingerprint-shaped ids). */
export function extractTurnkeySolSendTransactionStatusId(response: Record<string, unknown>): string | null {
  const direct = takeSendStatusId(response.sendTransactionStatusId ?? response.send_transaction_status_id)
  if (direct) return direct

  const act = asRecord(response.activity)
  if (act) {
    const fromProofs = extractSendStatusIdFromAppProofs(act)
    if (fromProofs) return fromProofs
  }

  const res = act ? normalizeActivityResult(act.result) : null
  if (res) {
    const rawSol = res.solSendTransactionResult ?? res.sol_send_transaction_result
    const sol = unwrapSolSendTransactionResultPayload(rawSol)
    if (sol) {
      const nested = takeSendStatusId(sol.sendTransactionStatusId ?? sol.send_transaction_status_id)
      if (nested) return nested
    }
    const flat = takeSendStatusId(res.sendTransactionStatusId ?? res.send_transaction_status_id)
    if (flat) return flat
  }

  return deepFindSendTransactionStatusId(response, 0)
}

async function probeActivityIdAsSendTransactionStatusId(
  client: TurnkeyClientLike,
  organizationId: string,
  activityId: string,
): Promise<string | null> {
  if (!activityId || activityId.startsWith("sha256:")) return null
  if (typeof client.getSendTransactionStatus !== "function") return null
  try {
    const res = await client.getSendTransactionStatus({
      organizationId,
      sendTransactionStatusId: activityId,
    })
    const txStatus = String(
      res?.txStatus ?? res?.status ?? res?.transactionStatus ?? res?.sendTransactionStatus ?? "",
    ).trim()
    if (txStatus) return activityId
  } catch {
    /* Turnkey rejects unknown ids */
  }
  return null
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Turnkey can return `ACTIVITY_STATUS_COMPLETED` while `activity.result.solSendTransactionResult` is still `{}`.
 * The SDK `command()` merge then omits `sendTransactionStatusId` until the result row is populated.
 */
async function backoffRefetchActivityUntilSolSendStatusId(
  client: TurnkeyClientLike,
  subOrgId: string,
  activityId: string,
): Promise<Record<string, unknown>[]> {
  if (typeof client.getActivity !== "function") return []
  const snapshots: Record<string, unknown>[] = []
  const maxAttempts = 36
  const delayMs = 500
  for (let i = 0; i < maxAttempts; i++) {
    if (i > 0) await sleep(delayMs)
    try {
      const data = (await client.getActivity({
        organizationId: subOrgId,
        activityId,
      })) as Record<string, unknown>
      snapshots.push(data)
      if (extractTurnkeySolSendTransactionStatusId(data)) return snapshots
      const act = asRecord(data.activity)
      const st = String(act?.status ?? "")
      if (st === "ACTIVITY_STATUS_FAILED" || st === "ACTIVITY_STATUS_REJECTED") return snapshots
    } catch {
      break
    }
  }
  return snapshots
}

export async function resolveSolSendParsedIds(
  client: TurnkeyClientLike,
  subOrgId: string,
  initialResponse: Record<string, unknown>,
): Promise<{ providerTransactionId: string; providerEventId: string | null; txHash: string | null }> {
  const bodies: Record<string, unknown>[] = [initialResponse]
  const act0 = asRecord(initialResponse.activity)
  const activityId = String(act0?.id ?? "").trim()
  if (activityId && !activityId.startsWith("sha256:") && typeof client.getActivity === "function") {
    try {
      bodies.push(
        (await client.getActivity({
          organizationId: subOrgId,
          activityId,
        })) as Record<string, unknown>,
      )
    } catch {
      /* best-effort */
    }
  }

  let lastErr: unknown
  for (const body of bodies) {
    try {
      return parseTurnkeySendIds(body)
    } catch (e) {
      lastErr = e
    }
  }

  if (activityId && !activityId.startsWith("sha256:")) {
    const refetched = await backoffRefetchActivityUntilSolSendStatusId(client, subOrgId, activityId)
    for (const body of refetched) {
      try {
        return parseTurnkeySendIds(body)
      } catch (e) {
        lastErr = e
      }
    }
  }

  if (activityId && !activityId.startsWith("sha256:")) {
    const probed = await probeActivityIdAsSendTransactionStatusId(client, subOrgId, activityId)
    if (probed) {
      return { providerTransactionId: probed, providerEventId: null, txHash: null }
    }
  }

  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr))
}

function parseTurnkeySendIds(response: Record<string, unknown>): {
  providerTransactionId: string
  providerEventId: string | null
  txHash: string | null
} {
  const providerTransactionId = extractTurnkeySolSendTransactionStatusId(response)
  if (!providerTransactionId) {
    const status = String(asRecord(response.activity)?.status ?? "").trim() || "unknown"
    const summary = activityResultKeySummary(response)
    throw new Error(
      `Turnkey send did not return sendTransactionStatusId (activity.status=${status}; ${summary}). Cannot poll broadcast status.`,
    )
  }
  const providerEventId = String(response.eventId ?? response.requestId ?? "").trim() || null
  const txHash =
    String(response.signature ?? response.txHash ?? response.transactionHash ?? response.hash ?? "").trim() || null
  return { providerTransactionId, providerEventId, txHash }
}

/** Turnkey query bodies are usually flat; unwrap common gateway nesting. */
export function normalizeTurnkeyGetSendTransactionStatusPayload(raw: unknown): Record<string, unknown> {
  const r = asRecord(raw)
  if (!r) return {}
  if (r.txStatus != null || r.solana != null || r.eth != null || r.txError != null) return r
  const inner = asRecord(r.result ?? r.data ?? r.activity ?? r.sendTransactionStatus)
  if (inner && (inner.txStatus != null || inner.solana != null || inner.eth != null || inner.txError != null)) {
    return inner
  }
  return r
}

export function extractTurnkeySendFailureSummary(raw: unknown): string | null {
  const r = normalizeTurnkeyGetSendTransactionStatusPayload(raw)
  const sol = asRecord(r.solana)
  const parts = [
    String(r.txError ?? "").trim(),
    String(asRecord(r.error)?.message ?? "").trim(),
    String(sol?.rpcMessage ?? "").trim(),
  ].filter(Boolean)
  const unique = [...new Set(parts)]
  return unique.length ? unique.join(" | ").slice(0, 1500) : null
}
/** Turnkey nests Solana signature on `getSendTransactionStatus` under `solana.signature`, not root `signature`. */
export function extractTxHashFromTurnkeySendStatusResponse(res: unknown): string | null {
  const r = normalizeTurnkeyGetSendTransactionStatusPayload(res)
  const sol = asRecord(r.solana)
  const eth = asRecord(r.eth)
  const fromSol = String(sol?.signature ?? "").trim()
  if (fromSol) return fromSol
  const fromEth = String(eth?.txHash ?? "").trim()
  if (fromEth) return fromEth
  const top = String(r.signature ?? r.txHash ?? r.transactionHash ?? r.hash ?? "").trim()
  return top || null
}

/**
 * Maps Turnkey `getSendTransactionStatus` to Easner ledger semantics.
 * @see Turnkey `pollTransactionStatus` – terminal success `COMPLETED` | `INCLUDED`, failure `FAILED` | `CANCELLED`.
 */
export function interpretTurnkeyGetSendTransactionStatus(res: unknown): {
  status: "pending" | "settled" | "failed"
  txHash: string | null
} {
  const r = normalizeTurnkeyGetSendTransactionStatusPayload(res)
  const txHash = extractTxHashFromTurnkeySendStatusResponse(r)

  const txError = String(r.txError ?? "").trim()
  const errObj = asRecord(r.error)
  const errMsg = String(errObj?.message ?? "").trim()
  if (txError || errMsg) {
    return { status: "failed", txHash }
  }

  const statusPick =
    r.txStatus ?? r.status ?? r.transactionStatus ?? r.sendTransactionStatus ?? null
  const statusRaw = (statusPick == null ? "" : String(statusPick)).toLowerCase()

  if (statusRaw.includes("fail") || statusRaw.includes("revert") || statusRaw.includes("cancel")) {
    return { status: "failed", txHash }
  }

  if (
    statusRaw === "completed" ||
    statusRaw === "included" ||
    statusRaw.includes("confirm") ||
    statusRaw.includes("includ") ||
    statusRaw.includes("complete") ||
    statusRaw.includes("success") ||
    statusRaw.includes("landed") ||
    statusRaw.includes("finalized")
  ) {
    return { status: "settled", txHash }
  }

  // Early snapshots may omit `txStatus` while `solana.signature` is already present.
  if (txHash && statusRaw === "") {
    return { status: "settled", txHash }
  }

  return { status: "pending", txHash }
}

/**
 * Polls `getSendTransactionStatus` until {@link interpretTurnkeyGetSendTransactionStatus} is terminal
 * or timeout. Turnkey's SDK `pollTransactionStatus` skips ticks when `txStatus` is empty, which can
 * hang; we use our own loop and shared interpretation (incl. `solana.signature`).
 */
export async function pollUntilTurnkeySendTerminal(
  client: TurnkeyClientLike,
  organizationId: string,
  sendTransactionStatusId: string,
  opts: { timeoutMs: number; intervalMs: number; returnOnSignature?: boolean },
): Promise<unknown | null> {
  if (typeof client.getSendTransactionStatus !== "function") return null
  const deadline = Date.now() + opts.timeoutMs
  let last: unknown = null
  while (Date.now() < deadline) {
    last = await client.getSendTransactionStatus({
      organizationId,
      sendTransactionStatusId,
    })
    const m = interpretTurnkeyGetSendTransactionStatus(last)
    if (m.status === "settled" || m.status === "failed") return last
    if (opts.returnOnSignature && m.txHash) return last
    await sleep(opts.intervalMs)
  }
  return last
}

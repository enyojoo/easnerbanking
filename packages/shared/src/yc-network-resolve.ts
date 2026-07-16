export type YcNetworkLike = {
  id?: string
  networkId?: string
  code?: string
  name?: string
  status?: string
  channelIds?: string[]
}

function networkIdFrom(row: YcNetworkLike | undefined): string | undefined {
  if (!row) return undefined
  const id = String(row.id ?? row.networkId ?? "").trim()
  return id || undefined
}

function normalizeNetworkLabel(value: string): string {
  return value
    .toLowerCase()
    .replace(/\b(plc|ltd|limited|nigeria|ng)\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
}

function labelsMatch(needle: string, haystack: string): boolean {
  const n = normalizeNetworkLabel(needle)
  const h = normalizeNetworkLabel(haystack)
  if (!n || !h) return false
  return h.includes(n) || n.includes(h)
}

function isManualInputNetwork(row: YcNetworkLike): boolean {
  return String(row.name ?? "")
    .trim()
    .toLowerCase()
    .includes("manual input")
}

/** Pick YC destination networkId for a send, scoped to channel when possible. */
export function pickYcSendNetworkId(input: {
  networks: YcNetworkLike[]
  channelId?: string | null
  bankName?: string | null
  mobileProvider?: string | null
  isMomo: boolean
}): string | undefined {
  let rows = input.networks.filter((n) => String(n.status ?? "").toLowerCase() !== "inactive")
  const channelId = String(input.channelId ?? "").trim()
  if (channelId) {
    const scoped = rows.filter(
      (n) =>
        Array.isArray(n.channelIds) &&
        n.channelIds.some((id) => String(id).trim() === channelId),
    )
    if (scoped.length > 0) rows = scoped
  }

  if (input.isMomo) {
    const needle = String(input.mobileProvider ?? "").trim()
    if (needle) {
      const match = rows.find((n) => {
        const label = `${n.name ?? ""} ${n.code ?? ""} ${n.networkId ?? ""}`
        return labelsMatch(needle, label)
      })
      if (match) return networkIdFrom(match)
    }
    const manual = rows.find(isManualInputNetwork)
    if (manual) return networkIdFrom(manual)
    return rows.length === 1 ? networkIdFrom(rows[0]) : undefined
  }

  const bankName = String(input.bankName ?? "").trim()
  if (bankName && !bankName.toLowerCase().includes("mobile money")) {
    const match = rows.find((n) => {
      const label = `${n.name ?? ""} ${n.code ?? ""}`
      return labelsMatch(bankName, label)
    })
    if (match) return networkIdFrom(match)
  }

  const manual = rows.find(isManualInputNetwork)
  if (manual) return networkIdFrom(manual)

  return rows.length === 1 ? networkIdFrom(rows[0]) : undefined
}

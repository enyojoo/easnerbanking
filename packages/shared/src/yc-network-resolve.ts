import { gridBankLabelsMatch } from "./grid-bank-resolve"

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
        return gridBankLabelsMatch(needle, label)
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
      return gridBankLabelsMatch(bankName, label)
    })
    if (match) return networkIdFrom(match)
  }

  const manual = rows.find(isManualInputNetwork)
  if (manual) return networkIdFrom(manual)

  return rows.length === 1 ? networkIdFrom(rows[0]) : undefined
}

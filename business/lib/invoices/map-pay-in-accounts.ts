import type { Account, StablecoinAccount } from "@/lib/finance-types"

/** JSON shape from `GET /api/noah/virtual-accounts` and server-side VA resolution. */
export type VirtualAccountJson = {
  hasAccount?: boolean
  currency?: string
  accountNumber?: string
  routingNumber?: string
  sortCode?: string
  iban?: string
  bic?: string
  bankName?: string
  bankAddress?: string
  accountHolderName?: string
  provider?: "grid" | "noah"
}

function maskTail(s: string | undefined, visible = 4): string {
  if (!s) return "—"
  const t = s.replace(/\s/g, "")
  if (t.length <= visible) return t
  return `••••${t.slice(-visible)}`
}

export function buildPayInAccountsFromSources(opts: {
  invoiceCurrency: string
  displayName: string
  va: VirtualAccountJson | null | undefined
  walletAddress?: string
  walletMemo?: string
  /** Shown on Account row when needed; PDF does not rely on this. */
  balance?: number
  canProvision: boolean
}): { bankAccount?: Account; stablecoinAccount?: StablecoinAccount } {
  const {
    invoiceCurrency,
    displayName,
    va,
    walletAddress,
    walletMemo,
    balance = 0,
    canProvision,
  } = opts

  if (!canProvision) return {}

  const code = invoiceCurrency.trim().toUpperCase()
  const hasVa = Boolean(va?.hasAccount)
  const usdc = code === "USD" || code === "GBP"
  const eurc = code === "EUR"

  const bankCurrency = (
    code === "USD" || code === "EUR" || code === "GBP" || code === "NGN" ? code : "USD"
  ) as Account["currency"]

  let bankAccount: Account | undefined
  if (hasVa && (code === "USD" || code === "EUR" || code === "GBP")) {
    bankAccount = {
      id: `acc_${code.toLowerCase()}`,
      currency: bankCurrency,
      accountName: va?.accountHolderName || displayName,
      bankName: va?.bankName || "—",
      accountNumber: maskTail(va?.accountNumber ?? va?.iban),
      fullAccountNumber: va?.accountNumber ?? va?.iban ?? "",
      routingNumber: code === "USD" ? va?.routingNumber : undefined,
      sortCode: code === "GBP" ? va?.sortCode ?? va?.routingNumber : undefined,
      iban: code === "EUR" ? va?.iban : undefined,
      bic: code === "EUR" ? va?.bic : undefined,
      bankAddress: va?.bankAddress,
      depositProvider: va?.provider === "grid" ? "grid" : va?.provider === "noah" ? "noah" : undefined,
      balance,
      availableBalance: balance,
      status: "active",
      stablecoinAddress: walletAddress || undefined,
      stablecoinChain: "Solana",
      stablecoinToken: usdc ? "USDC" : eurc ? "EURC" : "USDC",
    }
  }

  let stablecoinAccount: StablecoinAccount | undefined
  const addr = walletAddress?.trim()
  if (addr && (usdc || eurc)) {
    stablecoinAccount = {
      currency: eurc ? "EUR" : "USD",
      stablecoin: eurc ? "EURC" : "USDC",
      chain: "Solana",
      address: addr,
      memo: walletMemo?.trim() || "",
    }
  }

  return { bankAccount, stablecoinAccount }
}

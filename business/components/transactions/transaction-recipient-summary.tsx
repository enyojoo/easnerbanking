"use client"

import {
  resolveTransactionRecipientDisplay,
  type GlobalPayoutRecipientSnapshot,
  type TransactionRecipientDisplay,
} from "@easner/shared"
import { SendSelectedRecipientSummary } from "@/components/send/send-selected-recipient-summary"
import type { Beneficiary } from "@/lib/recipient-types"

function toBeneficiary(display: TransactionRecipientDisplay): Beneficiary {
  const now = new Date().toISOString()
  const tag = display.payeeEasetag
  return {
    id: tag ? `tx-easetag:${tag}` : "tx-recipient",
    payeeEasetag: tag,
    name: display.fullName,
    bankName: display.bankName ?? (tag ? `Easetag (@${tag})` : ""),
    accountNumber: display.accountNumber ?? tag ?? "",
    fullAccountNumber: display.accountNumber ?? tag ?? "",
    countryCode: display.countryCode,
    country: display.countryCode ?? "",
    currency: display.currency ?? "USD",
    email: "",
    phone: display.phone ?? "",
    mobileProvider: display.mobileProvider,
    walletNetwork: display.walletNetwork,
    walletAsset: display.walletAsset,
    createdAt: now,
    lastUsed: now,
  }
}

type Props = {
  recipientSnapshot?: GlobalPayoutRecipientSnapshot | null
  recipientName?: string | null
  counterpartyName?: string | null
  counterpartyAddress?: string | null
  receiveNetwork?: string | null
  receiveCurrency?: string | null
  payeeEasetag?: string | null
  alignEnd?: boolean
  className?: string
}

/** Review-style recipient chip for transaction detail rows (flag, token, or Easetag avatar). */
export function TransactionRecipientSummary({
  recipientSnapshot,
  recipientName,
  counterpartyName,
  counterpartyAddress,
  receiveNetwork,
  receiveCurrency,
  payeeEasetag,
  alignEnd = true,
  className,
}: Props) {
  const display = resolveTransactionRecipientDisplay({
    recipientSnapshot,
    recipientName,
    counterpartyName,
    counterpartyAddress,
    receiveNetwork,
    receiveCurrency,
    payeeEasetag,
  })

  if (!display) return null

  return (
    <SendSelectedRecipientSummary
      beneficiary={toBeneficiary(display)}
      alignEnd={alignEnd}
      className={className ?? (alignEnd ? "min-w-0 max-w-[70%] shrink-0" : "min-w-0 flex-1")}
    />
  )
}

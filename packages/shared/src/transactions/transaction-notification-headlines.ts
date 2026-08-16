export type NotificationOutcome = "success" | "failed" | "reversed"

export type TransactionNotificationHeadlines = {
  /** Lock-screen / notification center title */
  pushTitle: string
  /** SendGrid subject line */
  emailSubject: string
  /** Email HTML H1 */
  title: string
}

function capitalizeFirst(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return "Transaction"
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1)
}

/** Human-readable activity name for push/email subjects (sentence case). */
export function activityLabelForNotification(
  kind: string,
  category: string,
): string {
  switch (kind) {
    case "easetag_send":
      return "Easetag transfer"
    case "easetag_receive":
      return "Easetag deposit"
    case "card_topup":
      return "Card top-up"
    case "card_payment":
      return "Card payment"
    case "bank_deposit":
      return "Bank deposit"
    case "stablecoin_deposit":
      return "Stablecoin deposit"
    case "stablecoin_transfer":
      return "Stablecoin transfer"
    case "bank_verification_credit":
      return "Bank verification deposit"
    case "bank_payout":
    case "bank_transfer":
      return capitalizeFirst(category)
    default:
      return capitalizeFirst(category)
  }
}

export function buildTransactionNotificationHeadlines(
  activityLabel: string,
  outcome: NotificationOutcome,
  options?: { successUsesCompleteSuffix?: boolean },
): TransactionNotificationHeadlines {
  const activity = activityLabel.trim() || "Transaction"
  const successSuffix = options?.successUsesCompleteSuffix !== false

  if (outcome === "success") {
    const line = successSuffix ? `${activity} complete` : activity
    return { pushTitle: line, emailSubject: line, title: line }
  }

  if (outcome === "failed") {
    const line = `${activity} failed`
    return {
      pushTitle: line,
      emailSubject: line,
      title: `${activity} couldn't be completed`,
    }
  }

  return {
    pushTitle: "Transaction reversed",
    emailSubject: "Transaction reversed",
    title: "Transaction reversed",
  }
}

import {
  deriveTransactionNotification,
  descriptorToPushContent,
  type DeriveTransactionNotificationInput,
} from "@easner/shared"

export type TransactionSettledContentInput = DeriveTransactionNotificationInput

export function buildTransactionSettledPushContent(input: TransactionSettledContentInput): {
  title: string
  body: string
} {
  const descriptor = deriveTransactionNotification({ ...input, outcome: input.outcome ?? "success" })
  return descriptorToPushContent(descriptor)
}

export {
  deriveTransactionNotification,
  descriptorToPushContent,
} from "@easner/shared"

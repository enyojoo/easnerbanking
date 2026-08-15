import { isDraftRecipientId } from '@easner/shared'
import type { Recipient } from '../types'
import { recipientService, type RecipientData } from './recipientService'

export async function resolveDraftRecipient(
  userId: string,
  recipient: Recipient,
  persist?: RecipientData,
): Promise<Recipient> {
  if (!isDraftRecipientId(recipient.id)) return recipient
  if (!persist) {
    throw new Error('Draft recipient is missing save payload.')
  }
  return recipientService.findOrCreate(userId, persist)
}

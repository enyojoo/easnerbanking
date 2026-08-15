import type { SupabaseClient } from "@supabase/supabase-js"
import {
  findMatchingRecipient,
  recipientIdentityFromWritePayload,
  type RecipientRowShape,
} from "@easner/shared"
import {
  looksLikeMissingStructuredColumn,
  toRecipientLegacyPayload,
  type RecipientWritePayload,
} from "@/lib/recipients-write-payload"

export type RecipientRow = RecipientRowShape & {
  id: string
  user_id: string
  created_at?: string
  updated_at?: string
}

export type FindOrCreateRecipientResult = {
  recipient: RecipientRow
  created: boolean
}

async function insertRecipientRow(
  admin: SupabaseClient,
  userId: string,
  payload: RecipientWritePayload,
): Promise<RecipientRow> {
  const primary = await admin
    .from("recipients")
    .insert({ ...payload, user_id: userId })
    .select("*")
    .single()
  if (!primary.error && primary.data) {
    return primary.data as RecipientRow
  }

  if (!looksLikeMissingStructuredColumn(primary.error)) {
    throw new Error(primary.error?.message || "Failed to create recipient")
  }

  const fallback = await admin
    .from("recipients")
    .insert({ ...toRecipientLegacyPayload(payload), user_id: userId })
    .select("*")
    .single()
  if (!fallback.error && fallback.data) {
    return fallback.data as RecipientRow
  }
  throw new Error(fallback.error?.message || "Failed to create recipient")
}

export async function listRecipientsForUser(
  admin: SupabaseClient,
  userId: string,
): Promise<RecipientRow[]> {
  const ordered = await admin
    .from("recipients")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
  if (!ordered.error) return (ordered.data || []) as RecipientRow[]

  const unordered = await admin.from("recipients").select("*").eq("user_id", userId)
  if (!unordered.error) return (unordered.data || []) as RecipientRow[]
  throw new Error(unordered.error.message)
}

export async function findRecipientByIdentity(
  admin: SupabaseClient,
  userId: string,
  payload: RecipientWritePayload,
): Promise<RecipientRow | null> {
  const identity = recipientIdentityFromWritePayload(payload)
  if (!identity) return null
  const rows = await listRecipientsForUser(admin, userId)
  return findMatchingRecipient(rows, identity)
}

export async function findOrCreateRecipient(
  admin: SupabaseClient,
  userId: string,
  payload: RecipientWritePayload,
): Promise<FindOrCreateRecipientResult> {
  const existing = await findRecipientByIdentity(admin, userId, payload)
  if (existing) {
    return { recipient: existing, created: false }
  }
  const recipient = await insertRecipientRow(admin, userId, payload)
  return { recipient, created: true }
}

export async function findRecipientIdentityCollision(
  admin: SupabaseClient,
  userId: string,
  payload: RecipientWritePayload,
  excludeRecipientId: string,
): Promise<RecipientRow | null> {
  const identity = recipientIdentityFromWritePayload(payload)
  if (!identity) return null
  const rows = await listRecipientsForUser(admin, userId)
  const match = findMatchingRecipient(rows, identity)
  if (!match) return null
  if (match.id === excludeRecipientId) return null
  return match
}

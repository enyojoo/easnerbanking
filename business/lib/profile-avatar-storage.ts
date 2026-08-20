import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { extensionForMime, uploadPublicImage } from "@/lib/supabase/storage-server"
import type { ParsedAvatarUpload } from "@/lib/profile-avatar-upload-body"

const AVATARS_BUCKET = "avatars" as const

/** One canonical object per user – re-uploads overwrite this path (no UUID sprawl). */
export function profileAvatarStoragePath(userId: string, contentType: string): string {
  const ext = extensionForMime(contentType)
  return `${userId}/avatar.${ext}`
}

/** Removes all objects under `{userId}/` (legacy UUID files + previous extensions). */
export async function removeAllProfileAvatarObjects(userId: string): Promise<void> {
  const admin = createSupabaseAdmin()
  const { data: entries, error: listError } = await admin.storage.from(AVATARS_BUCKET).list(userId, {
    limit: 100,
  })
  if (listError) {
    console.error("profile avatar list:", listError)
    return
  }
  if (!entries?.length) return

  const paths = entries
    .map((e) => (e.name ? `${userId}/${e.name}` : null))
    .filter((p): p is string => Boolean(p))
  if (paths.length === 0) return

  const { error: removeError } = await admin.storage.from(AVATARS_BUCKET).remove(paths)
  if (removeError) {
    console.error("profile avatar remove:", removeError)
  }
}

export async function storeProfileAvatarForUser(
  userId: string,
  parsed: Extract<ParsedAvatarUpload, { ok: true }>
): Promise<{ url: string; path: string } | { error: string }> {
  await removeAllProfileAvatarObjects(userId)
  const path = profileAvatarStoragePath(userId, parsed.contentType)
  const result = await uploadPublicImage({
    bucket: AVATARS_BUCKET,
    path,
    bytes: parsed.bytes,
    contentType: parsed.contentType,
  })
  if ("error" in result) {
    return { error: result.error }
  }
  return { url: result.url, path: result.path }
}

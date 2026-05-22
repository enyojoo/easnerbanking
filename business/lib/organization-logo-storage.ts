import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { extensionForMime, uploadPublicImage } from "@/lib/supabase/storage-server"

const ORG_LOGOS_BUCKET = "org-logos" as const

/** One canonical object per organization — re-uploads replace the same path. */
export function organizationLogoStoragePath(organizationId: string, contentType: string): string {
  const ext = extensionForMime(contentType)
  return `${organizationId}/logo.${ext}`
}

/** Removes all objects under `{organizationId}/` (legacy UUID files + previous extensions). */
export async function removeAllOrganizationLogoObjects(organizationId: string): Promise<void> {
  const admin = createSupabaseAdmin()
  const { data: entries, error: listError } = await admin.storage
    .from(ORG_LOGOS_BUCKET)
    .list(organizationId, { limit: 100 })
  if (listError) {
    console.error("organization logo list:", listError)
    return
  }
  if (!entries?.length) return

  const paths = entries
    .map((e) => (e.name ? `${organizationId}/${e.name}` : null))
    .filter((p): p is string => Boolean(p))
  if (paths.length === 0) return

  const { error: removeError } = await admin.storage.from(ORG_LOGOS_BUCKET).remove(paths)
  if (removeError) {
    console.error("organization logo remove:", removeError)
  }
}

export async function storeOrganizationLogo(
  organizationId: string,
  bytes: Buffer,
  contentType: string
): Promise<{ url: string; path: string } | { error: string }> {
  await removeAllOrganizationLogoObjects(organizationId)
  const path = organizationLogoStoragePath(organizationId, contentType)
  const result = await uploadPublicImage({
    bucket: ORG_LOGOS_BUCKET,
    path,
    bytes,
    contentType,
  })
  if ("error" in result) {
    return { error: result.error }
  }
  return { url: result.url, path: result.path }
}

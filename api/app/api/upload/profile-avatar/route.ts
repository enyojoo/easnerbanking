import { NextResponse } from "next/server"
import { getUserFromApiRequest } from "@/lib/supabase/admin"
import { validateImageFile } from "@/lib/supabase/storage-server"
import {
  parseProfileAvatarFormFile,
  parseProfileAvatarJsonBody,
} from "@/lib/profile-avatar-upload-body"
import { storeProfileAvatarForUser } from "@/lib/profile-avatar-storage"

export const runtime = "nodejs"

export async function POST(request: Request) {
  const user = await getUserFromApiRequest(request)
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const contentType = request.headers.get("content-type") ?? ""

  const parsed = contentType.includes("application/json")
    ? await parseProfileAvatarJsonBody(request)
    : await (async () => {
        let form: FormData
        try {
          form = await request.formData()
        } catch {
          return { ok: false as const, error: "Invalid form data.", status: 400 }
        }
        const raw = form.get("file")
        if (!raw || typeof raw === "string") {
          return await parseProfileAvatarFormFile(null)
        }
        const file = raw as File
        const v = validateImageFile(file)
        if (!v.ok) {
          return { ok: false as const, error: v.error, status: 400 }
        }
        return parseProfileAvatarFormFile(raw)
      })()

  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: parsed.status })
  }

  const stored = await storeProfileAvatarForUser(user.id, parsed)
  if ("error" in stored) {
    return NextResponse.json({ error: stored.error }, { status: 400 })
  }

  return NextResponse.json({ url: stored.url, path: stored.path })
}

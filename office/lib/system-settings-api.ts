import { officeFetch } from "@/lib/api-client"
import type { OfficeSystemSetting } from "@/hooks/queries"

async function asJson<T>(response: Response): Promise<T> {
  const data = (await response.json().catch(() => ({}))) as T & { error?: string }
  if (!response.ok) {
    throw new Error((data as { error?: string }).error || "Request failed")
  }
  return data
}

export const systemSettingsApi = {
  async upsert(settings: Array<{ key: string; value: string | boolean }>): Promise<OfficeSystemSetting[]> {
    const res = await officeFetch("/api/admin/system-settings", {
      method: "PUT",
      body: JSON.stringify({ settings }),
    })
    const data = await asJson<{ settings?: OfficeSystemSetting[] }>(res)
    return data.settings ?? []
  },
}

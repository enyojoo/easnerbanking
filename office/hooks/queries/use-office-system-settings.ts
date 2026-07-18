"use client"

import { useQuery } from "@tanstack/react-query"
import { supabase } from "@/lib/supabase"
import { officeKeys } from "@/lib/query/keys"
import { officeReferenceQueryDefaults } from "./query-options"
import { useOfficeAdminEnabled } from "./use-office-admin-enabled"

export type OfficeSystemSetting = {
  id: string
  key: string
  value: string
  data_type: string
  category: string
  description?: string
  is_active: boolean
  created_at: string
  updated_at: string
}

async function fetchOfficeSystemSettings(): Promise<OfficeSystemSetting[]> {
  const { data, error } = await supabase
    .from("system_settings")
    .select("*")
    .eq("is_active", true)
    .order("category", { ascending: true })

  if (error) throw error
  return (data ?? []) as OfficeSystemSetting[]
}

export function useOfficeSystemSettings() {
  const { enabled } = useOfficeAdminEnabled()

  return useQuery({
    queryKey: officeKeys.systemSettings(),
    enabled,
    ...officeReferenceQueryDefaults,
    queryFn: fetchOfficeSystemSettings,
  })
}

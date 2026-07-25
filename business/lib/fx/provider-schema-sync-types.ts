import type { GridCorridorSyncResult } from "@/lib/fx/grid-corridor-sync"

export type ProviderSchemaSyncResult = {
  ok: boolean
  updated: number
  skipped: number
  error?: string
}

export type AllCorridorSchemaSyncResult = {
  ok: boolean
  error?: string
  provision?: GridCorridorSyncResult
  schemas: {
    noah: Pick<ProviderSchemaSyncResult, "updated" | "skipped">
    yellowcard: Pick<ProviderSchemaSyncResult, "updated" | "skipped">
    grid: Pick<ProviderSchemaSyncResult, "updated" | "skipped">
  }
}

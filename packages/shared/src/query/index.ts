export { qk } from "./keys"
export type {
  QueryKeys,
  QueryFilters,
  TxFilters,
  AuditFilters,
  ApprovalStatus,
  DateRange,
} from "./keys"

export { scopeKey, scopeId, scopesEqual } from "./scope"
export type { Scope, BusinessScope, PersonalScope, ScopeKey } from "./scope"

export { createBaseQueryClient, isAuthError, isClientError } from "./client"
export type { AuthErrorLike } from "./client"

export { UX } from "./ux-rules"
export type { UXRules } from "./ux-rules"

export { STORAGE_POLICY } from "./storage-policy"
export type { StoragePolicy } from "./storage-policy"

export {
  attachRealtime,
  createBatcher,
  pickNewer,
} from "./realtime"
export type {
  SupabaseLikeClient,
  SupabaseLikeChannel,
  PostgresChangesFilter,
  PostgresChangesPayload,
  RealtimeHealth,
  VersionedRecord,
  AttachRealtimeOptions,
} from "./realtime"

export { pollingIntervalFor, isChannelHealthy } from "./polling-fallback"
export type { FreshnessBand } from "./polling-fallback"

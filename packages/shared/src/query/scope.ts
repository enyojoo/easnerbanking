/**
 * Easner data-scope model.
 *
 * Every scoped query key carries a `Scope` so that entity/account
 * switches never leak data across organizations.
 *
 *   - `business`  → an org + entity pair (Easner Business web/office)
 *   - `personal`  → a single user (Easner Personal mobile)
 *
 * `scopeKey()` returns the readonly tuple used as the prefix for every
 * scoped query key. Do not inline scope tuples elsewhere — always go
 * through this module so invalidations stay consistent.
 */

export type BusinessScope = {
  readonly kind: "business"
  readonly orgId: string
  readonly entityId: string
}

export type PersonalScope = {
  readonly kind: "personal"
  readonly userId: string
}

export type Scope = BusinessScope | PersonalScope

export type ScopeKey =
  | readonly ["scope", "business", string, string]
  | readonly ["scope", "personal", string]

export function scopeKey(scope: Scope): ScopeKey {
  return scope.kind === "business"
    ? (["scope", "business", scope.orgId, scope.entityId] as const)
    : (["scope", "personal", scope.userId] as const)
}

export function scopeId(scope: Scope): string {
  return scope.kind === "business"
    ? `${scope.orgId}:${scope.entityId}`
    : scope.userId
}

export function scopesEqual(a: Scope | null, b: Scope | null): boolean {
  if (!a || !b) return a === b
  if (a.kind !== b.kind) return false
  if (a.kind === "business" && b.kind === "business") {
    return a.orgId === b.orgId && a.entityId === b.entityId
  }
  if (a.kind === "personal" && b.kind === "personal") {
    return a.userId === b.userId
  }
  return false
}

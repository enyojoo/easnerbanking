/**
 * Turnkey signing ownership by surface.
 *
 * Custodial model: root API key provisions orgs; sends auto-use non-root easner-da when
 * TURNKEY_DA_* keys are set and org/sub-org is migrated (no manual enable flag).
 *
 * Full migration is auto-detected – fail-closed on stragglers without TURNKEY_DA_SENDS_STRICT.
 *
 * Threat model:
 * - DA key theft → policy-bound signing only; export/escalation denied.
 * - Root key theft → full admin until ops removes root from app workers.
 * - User session theft → app auth gates only (no Turnkey user passkey in custodial phase).
 */
export const TURNKEY_SIGNING_MATRIX = {
  wallet_provision: "backend_delegated_root",
  wallet_send: "backend_delegated_da_auto",
  onramp_address_resolve: "backend_readonly",
  offramp_broadcast: "backend_delegated_da_auto",
  terminal_session: "backend_delegated_da_auto",
  omnibus_send: "backend_delegated_da_auto",
} as const

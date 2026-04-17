/**
 * Signing ownership by surface (plan §9). Client vs delegated backend stamping is a product choice;
 * provisioning uses server Turnkey API keys under org/sub-org policy.
 */
export const TURNKEY_SIGNING_MATRIX = {
  wallet_provision: "backend_delegated",
  onramp_address_resolve: "backend_readonly",
  offramp_broadcast: "backend_delegated_or_client_policy",
  terminal_session: "backend_delegated",
} as const

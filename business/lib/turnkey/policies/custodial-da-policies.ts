import { MAINNET_EURC_MINT, MAINNET_USDC_MINT } from "@/lib/solana/spl-mints"

/** Solana program ids allowed for structured SPL / ATA sends. */
export const SOLANA_SYSTEM_PROGRAM_ID = "11111111111111111111111111111111"
export const SOLANA_SPL_TOKEN_PROGRAM_ID = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
export const SOLANA_TOKEN_2022_PROGRAM_ID = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"
export const SOLANA_ASSOCIATED_TOKEN_PROGRAM_ID = "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"

export const CUSTODIAL_DA_POLICY_NAMES = {
  denyExport: "easner-da-deny-export",
  denyEscalation: "easner-da-deny-escalation",
  allowSplSend: "easner-da-allow-spl-send",
  allowLifiSignBroadcast: "easner-da-allow-lifi-sign-broadcast",
} as const

export type CustodialDaPolicySpec = {
  policyName: string
  effect: "EFFECT_ALLOW" | "EFFECT_DENY"
  consensus: string
  condition: string
  notes?: string
}

function daConsensus(daUserId: string): string {
  return `approvers.any(user, user.id == '${daUserId}')`
}

function policyStringList(items: readonly string[]): string {
  return `[${items.map((item) => `'${item}'`).join(", ")}]`
}

function solanaProgramAllowlistCondition(): string {
  const programs = [
    SOLANA_SYSTEM_PROGRAM_ID,
    SOLANA_SPL_TOKEN_PROGRAM_ID,
    SOLANA_TOKEN_2022_PROGRAM_ID,
    SOLANA_ASSOCIATED_TOKEN_PROGRAM_ID,
  ]
  return `solana.tx.program_keys.all(p, p in ${policyStringList(programs)})`
}

function splMintAllowlistCondition(): string {
  const mints = [MAINNET_USDC_MINT, MAINNET_EURC_MINT]
  return `(solana.tx.spl_transfers.count() == 0 || solana.tx.spl_transfers.all(transfer, transfer.token_mint in ${policyStringList(mints)}))`
}

const DENY_ESCALATION_ACTIVITY_TYPES = [
  "ACTIVITY_TYPE_CREATE_API_KEYS",
  "ACTIVITY_TYPE_DELETE_API_KEYS",
  "ACTIVITY_TYPE_CREATE_USERS",
  "ACTIVITY_TYPE_DELETE_USERS",
  "ACTIVITY_TYPE_CREATE_POLICY",
  "ACTIVITY_TYPE_UPDATE_POLICY",
  "ACTIVITY_TYPE_DELETE_POLICY",
  "ACTIVITY_TYPE_UPDATE_ROOT_QUORUM",
  "ACTIVITY_TYPE_DELETE_SUB_ORGANIZATION",
  "ACTIVITY_TYPE_EXPORT_WALLET",
  "ACTIVITY_TYPE_EXPORT_WALLET_ACCOUNT",
  "ACTIVITY_TYPE_EXPORT_PRIVATE_KEY",
  "ACTIVITY_TYPE_IMPORT_WALLET",
  "ACTIVITY_TYPE_IMPORT_PRIVATE_KEY",
] as const

function denyEscalationCondition(): string {
  return DENY_ESCALATION_ACTIVITY_TYPES.map((t) => `activity.type == '${t}'`).join(" || ")
}

/**
 * Stable policy pack for custodial delegated-access signing.
 * Apply with root credentials; consensus binds each rule to the non-root DA user.
 */
export function buildCustodialDaPolicyPack(daUserId: string): CustodialDaPolicySpec[] {
  const consensus = daConsensus(daUserId)

  const splCondition = [
    "activity.type == 'ACTIVITY_TYPE_SOL_SEND_TRANSACTION'",
    solanaProgramAllowlistCondition(),
    "solana.tx.address_table_lookups.count() == 0",
    splMintAllowlistCondition(),
  ].join(" && ")

  const lifiCondition = [
    "(activity.type == 'ACTIVITY_TYPE_SIGN_AND_BROADCAST_TRANSACTION' || activity.type == 'ACTIVITY_TYPE_SOL_SEND_TRANSACTION')",
    "activity.action == 'SIGN'",
  ].join(" && ")

  return [
    {
      policyName: CUSTODIAL_DA_POLICY_NAMES.denyExport,
      effect: "EFFECT_DENY",
      consensus,
      condition: "activity.action == 'EXPORT'",
      notes: "Custodial: DA user cannot export wallet material.",
    },
    {
      policyName: CUSTODIAL_DA_POLICY_NAMES.denyEscalation,
      effect: "EFFECT_DENY",
      consensus,
      condition: denyEscalationCondition(),
      notes: "Custodial: DA user cannot escalate privileges or mutate org.",
    },
    {
      policyName: CUSTODIAL_DA_POLICY_NAMES.allowSplSend,
      effect: "EFFECT_ALLOW",
      consensus,
      condition: splCondition,
      notes: "Custodial: structured USDC/EURC SPL + ATA + sponsorship sends.",
    },
    {
      policyName: CUSTODIAL_DA_POLICY_NAMES.allowLifiSignBroadcast,
      effect: "EFFECT_ALLOW",
      consensus,
      condition: lifiCondition,
      notes: "Custodial: LI.FI sign-and-broadcast (broader Solana surface).",
    },
  ]
}

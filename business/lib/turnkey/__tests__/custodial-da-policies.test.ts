import { describe, expect, it } from "vitest"
import {
  buildCustodialDaPolicyPack,
  CUSTODIAL_DA_POLICY_NAMES,
  SOLANA_ASSOCIATED_TOKEN_PROGRAM_ID,
  SOLANA_SPL_TOKEN_PROGRAM_ID,
  SOLANA_SYSTEM_PROGRAM_ID,
  SOLANA_TOKEN_2022_PROGRAM_ID,
} from "@/lib/turnkey/policies/custodial-da-policies"
import { MAINNET_EURC_MINT, MAINNET_USDC_MINT } from "@/lib/solana/spl-mints"

describe("buildCustodialDaPolicyPack", () => {
  const daUserId = "da-user-123"

  it("builds four stable policies bound to the DA user", () => {
    const pack = buildCustodialDaPolicyPack(daUserId)
    expect(pack).toHaveLength(4)
    const names = pack.map((p) => p.policyName)
    expect(names).toContain(CUSTODIAL_DA_POLICY_NAMES.denyExport)
    expect(names).toContain(CUSTODIAL_DA_POLICY_NAMES.denyEscalation)
    expect(names).toContain(CUSTODIAL_DA_POLICY_NAMES.allowSplSend)
    expect(names).toContain(CUSTODIAL_DA_POLICY_NAMES.allowLifiSignBroadcast)
  })

  it("uses DA user in consensus for every policy", () => {
    for (const p of buildCustodialDaPolicyPack(daUserId)) {
      expect(p.consensus).toContain(daUserId)
    }
  })

  it("SPL allow policy includes program allowlist and stablecoin mints", () => {
    const spl = buildCustodialDaPolicyPack(daUserId).find(
      (p) => p.policyName === CUSTODIAL_DA_POLICY_NAMES.allowSplSend,
    )
    expect(spl?.effect).toBe("EFFECT_ALLOW")
    expect(spl?.condition).toContain(SOLANA_SYSTEM_PROGRAM_ID)
    expect(spl?.condition).toContain(SOLANA_SPL_TOKEN_PROGRAM_ID)
    expect(spl?.condition).toContain(SOLANA_TOKEN_2022_PROGRAM_ID)
    expect(spl?.condition).toContain(SOLANA_ASSOCIATED_TOKEN_PROGRAM_ID)
    expect(spl?.condition).toContain(MAINNET_USDC_MINT)
    expect(spl?.condition).toContain(MAINNET_EURC_MINT)
    expect(spl?.condition).toContain("address_table_lookups.count() == 0")
  })

  it("deny export blocks EXPORT action", () => {
    const deny = buildCustodialDaPolicyPack(daUserId).find(
      (p) => p.policyName === CUSTODIAL_DA_POLICY_NAMES.denyExport,
    )
    expect(deny?.effect).toBe("EFFECT_DENY")
    expect(deny?.condition).toContain("activity.action == 'EXPORT'")
  })

  it("LI.FI allow includes sign-and-broadcast activity type", () => {
    const lifi = buildCustodialDaPolicyPack(daUserId).find(
      (p) => p.policyName === CUSTODIAL_DA_POLICY_NAMES.allowLifiSignBroadcast,
    )
    expect(lifi?.condition).toContain("ACTIVITY_TYPE_SIGN_AND_BROADCAST_TRANSACTION")
  })
})

import { DEFAULT_ETHEREUM_ACCOUNTS, DEFAULT_SOLANA_ACCOUNTS } from "@turnkey/sdk-server"
import {
  getTurnkeyRootApiClient,
  getTurnkeyRootApiClientForSubOrganization,
} from "@/lib/turnkey/client"
import {
  getTurnkeyApiKeyCurveType,
  getTurnkeyApiPublicKey,
  isTurnkeyConfigured,
  isTurnkeyDaConfigured,
} from "@/lib/turnkey/config"
import { markSubOrgDaReadyInCache } from "@/lib/turnkey/da-readiness"
import { provisionCustodialDaForOrganization } from "@/lib/turnkey/provision-custodial-da"

export type CreateEasnerTurnkeySubOrganizationResult = {
  subOrganizationId: string
  daUserId: string | null
}

/**
 * Parent-org API: create a dedicated sub-organization for one Easner user/org (no embedded Turnkey signup).
 * Includes a second root user whose API key matches the parent org server key so `createWallet` in the
 * worker can stamp activities as the sub-org (avoids ORGANIZATION_MISMATCH).
 *
 * When DA keys are configured, also provisions non-root easner-da user + custodial policies in the sub-org.
 */
export async function createEasnerTurnkeySubOrganization(input: {
  subOrganizationName: string
  userName: string
  userEmail: string
}): Promise<CreateEasnerTurnkeySubOrganizationResult> {
  const client = getTurnkeyRootApiClient()
  if (!client || !isTurnkeyConfigured()) {
    throw new Error("Turnkey is not configured")
  }

  const name = input.subOrganizationName.trim().slice(0, 200) || "easner-sub-org"
  const userName = input.userName.trim().slice(0, 200) || "Easner user"
  const userEmail = input.userEmail.trim().toLowerCase()
  const serverPub = getTurnkeyApiPublicKey()
  if (!serverPub) {
    throw new Error("TURNKEY_API_PUBLIC_KEY is required to register the provisioner in each sub-org")
  }

  const res = await client.createSubOrganization({
    subOrganizationName: name,
    rootQuorumThreshold: 1,
    rootUsers: [
      {
        userName,
        userEmail,
        apiKeys: [],
        authenticators: [],
        oauthProviders: [],
      },
      {
        userName: "Easner provisioner",
        apiKeys: [
          {
            apiKeyName: "easner-server",
            publicKey: serverPub,
            curveType: getTurnkeyApiKeyCurveType(),
          },
        ],
        authenticators: [],
        oauthProviders: [],
      },
    ],
    wallet: {
      walletName: "Easner default",
      accounts: [...DEFAULT_ETHEREUM_ACCOUNTS, ...DEFAULT_SOLANA_ACCOUNTS],
    },
  })

  const subOrganizationId = String((res as { subOrganizationId?: string }).subOrganizationId ?? "").trim()
  if (!subOrganizationId) {
    throw new Error("Turnkey createSubOrganization did not return subOrganizationId")
  }

  let daUserId: string | null = null
  if (isTurnkeyDaConfigured()) {
    const subOrgRoot = getTurnkeyRootApiClientForSubOrganization(subOrganizationId)
    if (!subOrgRoot) throw new Error("Turnkey sub-org root client unavailable")
    const provisioned = await provisionCustodialDaForOrganization({
      organizationId: subOrganizationId,
      rootClient: subOrgRoot as Record<string, (...args: unknown[]) => Promise<unknown>>,
    })
    daUserId = provisioned.daUserId
    markSubOrgDaReadyInCache(subOrganizationId)
  }

  return { subOrganizationId, daUserId }
}

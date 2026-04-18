import { DEFAULT_ETHEREUM_ACCOUNTS, DEFAULT_SOLANA_ACCOUNTS } from "@turnkey/sdk-server"
import { getTurnkeyApiClient } from "@/lib/turnkey/client"
import { getTurnkeyApiKeyCurveType, getTurnkeyApiPublicKey, isTurnkeyConfigured } from "@/lib/turnkey/config"

/**
 * Parent-org API: create a dedicated sub-organization for one Easner user/org (no embedded Turnkey signup).
 * Includes a second root user whose API key matches the parent org server key so `createWallet` in the
 * worker can stamp activities as the sub-org (avoids ORGANIZATION_MISMATCH).
 */
export async function createEasnerTurnkeySubOrganization(input: {
  subOrganizationName: string
  userName: string
  userEmail: string
}): Promise<string> {
  const client = getTurnkeyApiClient()
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
  return subOrganizationId
}

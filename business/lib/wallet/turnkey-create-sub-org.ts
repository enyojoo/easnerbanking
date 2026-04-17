import { DEFAULT_ETHEREUM_ACCOUNTS, DEFAULT_SOLANA_ACCOUNTS } from "@turnkey/sdk-server"
import { getTurnkeyApiClient } from "@/lib/turnkey/client"
import { isTurnkeyConfigured } from "@/lib/turnkey/config"

/**
 * Parent-org API: create a dedicated sub-organization for one Easner user/org (no embedded Turnkey signup).
 * Root user is email-labeled only; vaults are created later via `createWallet` in the worker.
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

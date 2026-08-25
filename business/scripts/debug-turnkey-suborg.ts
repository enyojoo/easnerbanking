import { DEFAULT_ETHEREUM_ACCOUNTS, DEFAULT_SOLANA_ACCOUNTS } from "@turnkey/sdk-server"
import { getTurnkeyRootApiClient } from "@/lib/turnkey/client"
import { getTurnkeyApiKeyCurveType, getTurnkeyApiPublicKey, isTurnkeyConfigured } from "@/lib/turnkey/config"

async function main() {
  const client = getTurnkeyRootApiClient()
  console.log("configured", isTurnkeyConfigured(), !!client)
  if (!client) throw new Error("no client")
  const serverPub = getTurnkeyApiPublicKey()
  const name = `easner-business-53798479-3d39-428a-bd22-0b48fc3792a2-debug-${Date.now()}`
  try {
    const res = await client.createSubOrganization({
      subOrganizationName: name,
      rootQuorumThreshold: 1,
      rootUsers: [
        {
          userName: "Grizzly Construction Inc",
          userEmail: "company@grizzlyconstruction.buzz",
          apiKeys: [],
          authenticators: [],
          oauthProviders: [],
        },
        {
          userName: "Easner provisioner",
          apiKeys: [
            {
              apiKeyName: "easner-server",
              publicKey: serverPub!,
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
    console.log("keys", Object.keys(res || {}))
    console.log(JSON.stringify(res, null, 2).slice(0, 5000))
  } catch (e) {
    console.error("ERR", e instanceof Error ? e.message : e)
    if (e && typeof e === "object") {
      console.error(JSON.stringify(e, Object.getOwnPropertyNames(e as object), 2).slice(0, 5000))
    }
  }
}

main()

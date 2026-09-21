"use client"

import { useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { QRCodeSVG } from "qrcode.react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { CopyId } from "@/components/console/copy-id"
import { fetchWithSession } from "@/lib/fetch-with-session"
import { useConsoleLivemode } from "@/lib/console/livemode-context"
import { formatCurrency } from "@/lib/utils"

function vaultAsset(currency: string) {
  const value = currency.toUpperCase()
  if (value === "USD") return "USDC"
  if (value === "EUR") return "EURC"
  return value
}

type Instructions = Record<string, unknown>
type Address = { currency: string; network: string; address: string; asset: string }

export function ReceiveRailsPanel({
  accountId,
  currency,
  available,
  pending,
  showSimulate,
}: {
  accountId: string
  currency: string
  available?: number
  pending?: number
  showSimulate?: boolean
}) {
  const { livemode } = useConsoleLivemode()
  const queryClient = useQueryClient()
  const [simulating, setSimulating] = useState(false)
  const [onrampUrl, setOnrampUrl] = useState<string | null>(null)

  const instructions = useQuery({
    queryKey: ["platform-deposit-instructions", accountId, livemode],
    queryFn: async () => {
      const res = await fetchWithSession(
        `/api/platform/accounts/${accountId}/deposit_instructions?livemode=${livemode}`,
      )
      const body = (await res.json().catch(() => ({}))) as { instructions?: Instructions; error?: string }
      if (!res.ok) throw new Error(body.error || "Could not load bank details")
      return body.instructions ?? {}
    },
  })

  const addresses = useQuery({
    queryKey: ["platform-deposit-addresses", accountId, livemode],
    queryFn: async () => {
      const res = await fetchWithSession(
        `/api/platform/accounts/${accountId}/deposit_addresses?livemode=${livemode}`,
      )
      const body = (await res.json().catch(() => ({}))) as { addresses?: Address[]; error?: string }
      if (!res.ok) throw new Error(body.error || "Could not load wallet address")
      return body.addresses ?? []
    },
  })

  const wallet = addresses.data?.[0]
  const bank = instructions.data ?? {}

  const simulate = async () => {
    setSimulating(true)
    try {
      const res = await fetchWithSession(
        `/api/platform/accounts/${accountId}/simulate-deposit?livemode=${livemode}`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ amount: 1000 }) },
      )
      const body = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) {
        toast.error(body.error || "Could not simulate deposit")
        return
      }
      toast.success("Test deposit credited. Watch Payments and Webhooks.")
      await queryClient.invalidateQueries({ queryKey: ["platform-accounts"] })
      await queryClient.invalidateQueries({ queryKey: ["platform-account", accountId] })
      await queryClient.invalidateQueries({ queryKey: ["platform-transactions"] })
      await queryClient.invalidateQueries({ queryKey: ["platform-customer"] })
    } finally {
      setSimulating(false)
    }
  }

  const startOnramp = async () => {
    const res = await fetchWithSession(
      `/api/platform/accounts/${accountId}/onramp_sessions?livemode=${livemode}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: 1000 }),
      },
    )
    const body = (await res.json().catch(() => ({}))) as { url?: string; error?: string }
    if (!res.ok || !body.url) {
      toast.error(body.error || "Could not create onramp link")
      return
    }
    setOnrampUrl(body.url)
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        This is a customer vault. {vaultAsset(currency)} on Solana. Bank rails convert into the vault.
      </p>
      {available != null ? (
        <p className="text-sm">
          Available {formatCurrency(available / 100, currency)}
          {pending ? ` · Pending ${formatCurrency(pending / 100, currency)}` : ""}
        </p>
      ) : null}

      <Card>
        <CardContent className="space-y-2 p-5">
          <p className="text-sm font-medium">Bank ({currency === "EUR" ? "SEPA" : "ACH"})</p>
          {instructions.isError ? (
            <p className="text-sm text-muted-foreground">
              {instructions.error instanceof Error ? instructions.error.message : "Bank details unavailable."}
            </p>
          ) : (
            <dl className="grid gap-2 text-sm">
              {Object.entries(bank)
                .filter(([key]) => key !== "type")
                .map(([key, value]) => (
                  <div key={key} className="flex items-center justify-between gap-3">
                    <dt className="text-muted-foreground">{key.replace(/_/g, " ")}</dt>
                    <dd className="font-mono text-xs">{String(value ?? "—")}</dd>
                  </div>
                ))}
            </dl>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 p-5">
          <p className="text-sm font-medium">Wallet</p>
          {wallet?.address ? (
            <>
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs text-muted-foreground">
                  {wallet.asset} · {wallet.network}
                </span>
                <CopyId id={wallet.address} />
              </div>
              <div className="flex justify-center rounded-lg border bg-background p-4">
                <QRCodeSVG value={wallet.address} size={160} includeMargin />
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              {addresses.isError
                ? addresses.error instanceof Error
                  ? addresses.error.message
                  : "Wallet address unavailable."
                : "No wallet address yet."}
            </p>
          )}
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="outline" onClick={() => void startOnramp()}>
          Onramp link
        </Button>
        {livemode === "test" && showSimulate ? (
          <Button type="button" size="sm" disabled={simulating} onClick={() => void simulate()}>
            {simulating ? "Crediting…" : "Simulate test deposit"}
          </Button>
        ) : null}
      </div>
      {onrampUrl ? (
        <a href={onrampUrl} className="block truncate text-sm underline underline-offset-2" target="_blank" rel="noreferrer">
          {onrampUrl}
        </a>
      ) : null}
    </div>
  )
}

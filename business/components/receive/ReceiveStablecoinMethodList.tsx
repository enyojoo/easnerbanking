"use client"

import { ArrowRight } from "lucide-react"
import { formatStablecoinDepositSchemeLabel } from "@easner/shared"
import { getTokenIconUrl } from "@/lib/crypto-icons"
import { cn } from "@/lib/utils"

export type StablecoinReceiveMethod = {
  id: string
  asset: string
  network: string
  status: "active" | "provisioning" | "unavailable"
  address?: string
  estimatedFeeBps?: number | null
}

function methodTitle(method: StablecoinReceiveMethod): string {
  return formatStablecoinDepositSchemeLabel({
    asset: method.asset,
    chain: method.network,
  })
}

function methodSubtitle(method: StablecoinReceiveMethod): string {
  if (method.status === "provisioning") return "Setting up…"
  if (method.status === "unavailable") return "Unavailable"
  if (method.network === "Tron") return "Bridge fee applies · Tron"
  return `Instant · ${method.network}`
}

function TokenLeading({ asset }: { asset: string }) {
  const uri = getTokenIconUrl(asset)
  return (
    <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border/80 bg-muted/40">
      {uri ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={uri} alt="" width={48} height={48} className="size-full object-cover" />
      ) : (
        <span className="text-xs font-semibold text-primary">{asset.slice(0, 2)}</span>
      )}
    </div>
  )
}

export function ReceiveStablecoinMethodList(props: {
  methods: StablecoinReceiveMethod[]
  onSelect: (method: StablecoinReceiveMethod) => void
}) {
  if (props.methods.length === 0) {
    return (
      <p className="py-4 text-center text-sm text-muted-foreground">
        Stablecoin deposit methods are not available right now.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {props.methods.map((method) => {
        const disabled = method.status !== "active"
        return (
          <button
            key={method.id}
            type="button"
            disabled={disabled}
            className={cn(
              "flex w-full min-h-[76px] items-center gap-4 rounded-xl border border-border p-4 text-left transition-colors hover:bg-muted/50",
              disabled && "opacity-55",
            )}
            onClick={() => props.onSelect(method)}
          >
            <TokenLeading asset={method.asset} />
            <div className="min-w-0 flex-1">
              <p className="font-medium">{methodTitle(method)}</p>
              <p className="mt-0.5 text-sm text-muted-foreground">{methodSubtitle(method)}</p>
            </div>
            <ArrowRight className="h-5 w-5 shrink-0 text-muted-foreground" />
          </button>
        )
      })}
    </div>
  )
}

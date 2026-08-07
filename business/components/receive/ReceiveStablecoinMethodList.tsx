"use client"

import { ArrowRight } from "lucide-react"

export type StablecoinReceiveMethod = {
  id: string
  asset: string
  network: string
  status: "active" | "provisioning" | "unavailable"
  address?: string
  estimatedFeeBps?: number | null
}

export function ReceiveStablecoinMethodList(props: {
  methods: StablecoinReceiveMethod[]
  onSelect: (method: StablecoinReceiveMethod) => void
}) {
  if (props.methods.length === 0) return null

  return (
    <div className="space-y-2">
      {props.methods.map((method) => (
        <button
          key={method.id}
          type="button"
          className="flex w-full items-center justify-between rounded-lg border p-4 text-left hover:bg-muted/40"
          onClick={() => props.onSelect(method)}
          disabled={method.status !== "active"}
        >
          <div>
            <div className="font-medium">
              {method.asset} · {method.network}
            </div>
            <div className="text-sm text-muted-foreground">
              {method.status === "active"
                ? "Tap to view deposit address"
                : method.status === "provisioning"
                  ? "Setting up…"
                  : "Unavailable"}
            </div>
            {method.estimatedFeeBps != null && method.status === "active" ? (
              <div className="text-xs text-muted-foreground">
                Estimated bridge fee: ~{(method.estimatedFeeBps / 100).toFixed(2)}%
              </div>
            ) : null}
          </div>
          <ArrowRight className="h-4 w-4 text-muted-foreground" />
        </button>
      ))}
    </div>
  )
}

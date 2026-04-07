"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { fetchWithSession } from "@/lib/fetch-with-session"
import { cn } from "@/lib/utils"
import { TERMINAL_ALLOWED_PAIRS, isAllowedTerminalPair } from "@/lib/terminal-allowed-pairs"
import { WALLET_ASSET_NETWORKS, DEFAULT_WALLET_ASSET } from "@/lib/wallet-asset-networks"
import { getNetworkIconUrl, getTokenIconUrl } from "@/lib/crypto-icons"
import { useAuth } from "@/lib/auth-context"
import { dataCache, CACHE_KEYS } from "@/lib/cache"
import {
  useAutopayoutPayerWalletsCached,
  type AutopayoutPayerWalletRow,
} from "@/hooks/use-autopayout-payer-wallets-cached"
import { Archive, ChevronDown, Loader2, Plus } from "lucide-react"
import { toast } from "sonner"

const BUSINESS_NOAH_HEADERS = { "X-Easner-Noah-Scope": "business" } as const

function pairLabel(cryptoCurrency: string, network: string): string {
  return (
    TERMINAL_ALLOWED_PAIRS.find(
      (p) => p.cryptoCurrency === cryptoCurrency && p.network === network,
    )?.label ?? `${cryptoCurrency} · ${network}`
  )
}

function shortenAddress(address: string): string {
  const t = address.trim()
  if (t.length <= 16) return t
  return `${t.slice(0, 10)}…${t.slice(-6)}`
}

function initialsFromAddress(address: string): string {
  const t = address.trim().replace(/^0x/i, "")
  if (t.length >= 2) return t.slice(0, 2).toUpperCase()
  return (address.trim().slice(0, 2) || "?").toUpperCase()
}

function tokenIconSymbol(crypto: string): string {
  return String(crypto || "").replace(/_TEST$/i, "").toUpperCase()
}

export type AutopayoutPayerWalletPanelProps = {
  selectedWalletId: string | null
  onSelectWalletId: (id: string) => void
  /** Invalidate payer-wallet cache and refetch when mounted (fresh list on /qr-pay/create). */
  syncListsOnMount?: boolean
  className?: string
}

export function AutopayoutPayerWalletPanel({
  selectedWalletId,
  onSelectWalletId,
  syncListsOnMount = false,
  className,
}: AutopayoutPayerWalletPanelProps) {
  const { user } = useAuth()
  const { data: wallets, loading, refetch } = useAutopayoutPayerWalletsCached()
  const [addOpen, setAddOpen] = useState(false)
  const [selectedAsset, setSelectedAsset] = useState("")
  const [selectedNetwork, setSelectedNetwork] = useState("")
  const [assetOpen, setAssetOpen] = useState(false)
  const [networkOpen, setNetworkOpen] = useState(false)
  const [label, setLabel] = useState("")
  const [saving, setSaving] = useState(false)
  const [archivingId, setArchivingId] = useState<string | null>(null)
  const syncMountRef = useRef(false)

  const walletAssets = useMemo(() => Object.keys(WALLET_ASSET_NETWORKS), [])

  const networksForAsset = useMemo(
    () => WALLET_ASSET_NETWORKS[selectedAsset] ?? [],
    [selectedAsset],
  )

  const selectedPair = useMemo(() => {
    if (!selectedAsset || !selectedNetwork) return null
    return isAllowedTerminalPair(selectedAsset, selectedNetwork) ?? null
  }, [selectedAsset, selectedNetwork])

  const bump = useCallback(() => {
    if (user?.id) dataCache.invalidate(CACHE_KEYS.AUTOPAYOUT_PAYER_WALLETS(user.id))
    void refetch()
  }, [user?.id, refetch])

  useEffect(() => {
    if (!syncListsOnMount || !user?.id) return
    if (syncMountRef.current) return
    syncMountRef.current = true
    dataCache.invalidate(CACHE_KEYS.AUTOPAYOUT_PAYER_WALLETS(user.id))
    void refetch()
  }, [syncListsOnMount, user?.id, refetch])

  useEffect(() => {
    if (!addOpen) return
    const asset = walletAssets.includes(DEFAULT_WALLET_ASSET) ? DEFAULT_WALLET_ASSET : walletAssets[0] || ""
    const nets = asset ? (WALLET_ASSET_NETWORKS[asset] ?? []) : []
    setSelectedAsset(asset)
    setSelectedNetwork(nets[0] ?? "")
    setLabel("")
    setAssetOpen(false)
    setNetworkOpen(false)
  }, [addOpen, walletAssets])

  useEffect(() => {
    if (!selectedAsset) return
    const nets = WALLET_ASSET_NETWORKS[selectedAsset] ?? []
    if (!nets.length) {
      setSelectedNetwork("")
      return
    }
    if (!nets.includes(selectedNetwork)) {
      setSelectedNetwork(nets[0]!)
    }
  }, [selectedAsset, selectedNetwork])

  useEffect(() => {
    if (loading) return
    const selectable = wallets.filter((w) => !w.archived_at)
    if (!selectable.length) {
      onSelectWalletId("")
      return
    }
    const valid =
      selectedWalletId != null &&
      selectedWalletId !== "" &&
      selectable.some((w) => w.id === selectedWalletId)
    if (valid) return
    onSelectWalletId(selectable[0]!.id)
  }, [loading, wallets, selectedWalletId, onSelectWalletId])

  const handleAdd = async () => {
    const pair = selectedPair
    if (!pair) {
      toast.error("Select asset and network.")
      return
    }
    setSaving(true)
    try {
      const res = await fetchWithSession("/api/autopayout/payer-wallets", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...BUSINESS_NOAH_HEADERS },
        body: JSON.stringify({
          crypto_currency: pair.cryptoCurrency,
          network: pair.network,
          label: label.trim() || null,
        }),
      })
      const body = (await res.json().catch(() => ({}))) as { wallet?: { id: string }; error?: string }
      if (!res.ok) {
        toast.error(body.error || "Could not save wallet.")
        return
      }
      bump()
      if (body.wallet?.id) {
        onSelectWalletId(body.wallet.id)
      }
      toast.success("Wallet added.")
      setAddOpen(false)
    } finally {
      setSaving(false)
    }
  }

  const archiveWallet = async (w: AutopayoutPayerWalletRow) => {
    setArchivingId(w.id)
    try {
      const res = await fetchWithSession(`/api/autopayout/payer-wallets/${encodeURIComponent(w.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ archived: true }),
      })
      const body = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) {
        toast.error(body.error || "Could not archive.")
        return
      }
      bump()
      toast.success("Wallet archived.")
    } finally {
      setArchivingId(null)
    }
  }

  if (loading) {
    return (
      <div className={cn("flex justify-center py-8 text-muted-foreground", className)}>
        <Loader2 className="h-8 w-8 animate-spin" aria-hidden />
      </div>
    )
  }

  const hasWallets = wallets.length > 0
  const tokenIcon = getTokenIconUrl(tokenIconSymbol(selectedAsset))

  return (
    <div className={cn("mx-auto w-full space-y-4", className)}>
      {!hasWallets ?
        <div className="rounded-lg border p-4 text-center text-sm text-muted-foreground">
          Your counter wallet address is created from your provisioned account when you save.
        </div>
      : <div className="max-h-[min(520px,60vh)] space-y-3 overflow-y-auto pr-1">
          {wallets.map((w) => {
            const rowBusy = archivingId === w.id
            const archived = Boolean(w.archived_at)
            const isPicked = !archived && selectedWalletId === w.id
            const title = shortenAddress(w.source_address)
            const detail = pairLabel(w.crypto_currency, w.network)
            return (
              <div
                key={w.id}
                className={cn(
                  "flex items-start gap-3 rounded-lg border p-3 sm:p-4",
                  !archived && "cursor-pointer transition-colors hover:bg-muted/40",
                  archived && "cursor-default opacity-70",
                  isPicked && "border-primary ring-1 ring-primary/30",
                )}
                role="button"
                tabIndex={archived ? -1 : 0}
                onClick={() => {
                  if (!archived) onSelectWalletId(w.id)
                }}
                onKeyDown={(e) => {
                  if (archived) return
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault()
                    onSelectWalletId(w.id)
                  }
                }}
              >
                <div className="flex shrink-0 items-center gap-2 pt-0.5">
                  <div
                    className={cn(
                      "flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 border-muted-foreground",
                      isPicked && "border-primary",
                    )}
                    aria-hidden
                  >
                    {isPicked ? <span className="h-2 w-2 rounded-full bg-primary" /> : null}
                  </div>
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                    <span className="font-mono text-xs font-medium text-primary">{initialsFromAddress(w.source_address)}</span>
                  </div>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-mono text-sm font-medium leading-snug">{title}</p>
                    {archived ?
                      <Badge variant="secondary" className="text-xs font-normal">
                        Archived
                      </Badge>
                    : null}
                  </div>
                  <p className="mt-0.5 text-sm text-muted-foreground">{detail}</p>
                  {w.label ?
                    <p className="mt-0.5 text-xs text-muted-foreground">{w.label}</p>
                  : null}
                </div>
                {archived ? null : (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="shrink-0 text-muted-foreground hover:text-destructive"
                    disabled={rowBusy}
                    onClick={(e) => {
                      e.stopPropagation()
                      void archiveWallet(w)
                    }}
                    aria-label={`Archive wallet ${title}`}
                  >
                    {rowBusy ?
                      <Loader2 className="size-4 animate-spin" aria-hidden />
                    : <Archive className="size-4" aria-hidden />}
                  </Button>
                )}
              </div>
            )
          })}
        </div>
      }

      <div className="border-t pt-4">
        <Button type="button" variant="outline" className="w-full gap-2" size="sm" onClick={() => setAddOpen(true)}>
          <Plus className="h-4 w-4" aria-hidden />
          Add wallet address
        </Button>
      </div>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add wallet address</DialogTitle>
            <DialogDescription>Choose asset, network and the name for your placard.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-4">
            <div className="space-y-2">
              <label className="text-xs text-muted-foreground">Asset</label>
              <Popover open={assetOpen} onOpenChange={setAssetOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="h-12 w-full justify-between" type="button">
                    <span className="flex items-center gap-2">
                      {tokenIcon ?
                        <img src={tokenIcon} alt="" className="h-[18px] w-[18px] rounded-full object-cover" />
                      : null}
                      <span className={selectedAsset ? "" : "text-xs text-muted-foreground"}>
                        {selectedAsset || "Select asset"}
                      </span>
                    </span>
                    <ChevronDown className="h-4 w-4 opacity-60" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0">
                  <Command>
                    <CommandInput className="placeholder:text-xs" placeholder="Search asset…" />
                    <CommandList className="max-h-[260px] overflow-y-auto overscroll-contain">
                      <CommandEmpty>No asset found.</CommandEmpty>
                      <CommandGroup>
                        {walletAssets.map((asset) => (
                          <CommandItem
                            key={asset}
                            value={asset}
                            onSelect={() => {
                              setSelectedAsset(asset)
                              const firstNet = (WALLET_ASSET_NETWORKS[asset] ?? [])[0]
                              setSelectedNetwork(firstNet ?? "")
                              setAssetOpen(false)
                            }}
                          >
                            <span className="flex items-center gap-2">
                              {getTokenIconUrl(tokenIconSymbol(asset)) ?
                                <img
                                  src={getTokenIconUrl(tokenIconSymbol(asset))}
                                  alt=""
                                  className="h-[18px] w-[18px] rounded-full object-cover"
                                />
                              : null}
                              {asset}
                            </span>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-2">
              <label className="text-xs text-muted-foreground">Network</label>
              <Popover open={networkOpen} onOpenChange={setNetworkOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="h-12 w-full justify-between" type="button" disabled={!selectedAsset}>
                    <span className="flex min-w-0 items-center gap-2">
                      {selectedPair ?
                        <>
                          {getNetworkIconUrl(selectedPair.network) ?
                            <img
                              src={getNetworkIconUrl(selectedPair.network)!}
                              alt=""
                              className="h-[18px] w-[18px] shrink-0 rounded-full object-cover"
                            />
                          : null}
                          <span className="truncate">{selectedPair.label}</span>
                        </>
                      : <span className="text-xs text-muted-foreground">Select network</span>}
                    </span>
                    <ChevronDown className="h-4 w-4 shrink-0 opacity-60" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0">
                  <Command>
                    <CommandInput className="placeholder:text-xs" placeholder="Search network…" />
                    <CommandList className="max-h-[260px] overflow-y-auto overscroll-contain">
                      <CommandEmpty>No network found.</CommandEmpty>
                      <CommandGroup>
                        {networksForAsset.map((net) => {
                          const line = `${selectedAsset} (${net})`
                          return (
                            <CommandItem
                              key={net}
                              value={line}
                              onSelect={() => {
                                setSelectedNetwork(net)
                                setNetworkOpen(false)
                              }}
                            >
                              <span className="flex items-center gap-2">
                                {getNetworkIconUrl(net) ?
                                  <img
                                    src={getNetworkIconUrl(net)!}
                                    alt=""
                                    className="h-[18px] w-[18px] rounded-full object-cover"
                                  />
                                : null}
                                {line}
                              </span>
                            </CommandItem>
                          )
                        })}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-2 md:col-span-2">
              <label htmlFor="payer-wallet-label" className="text-xs text-muted-foreground">
                Counter or location (optional)
              </label>
              <Input
                id="payer-wallet-label"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="e.g. Front desk, Booth 2"
                className="h-12 placeholder:text-xs placeholder:text-muted-foreground/60"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={() => void handleAdd()} disabled={saving || !selectedPair}>
              {saving ? "Creating…" : "Create"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

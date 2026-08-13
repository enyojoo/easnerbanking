"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ArrowRight, ArrowLeft, Copy, Check, Plus, Share2, ShieldCheck } from "lucide-react"
import type { Account } from "@/lib/finance-types"
import { QRCodeSVG } from "qrcode.react"
import { CurrencyFlagCircle } from "@/components/currency-flag-circle"
import { CountryFlag } from "@/components/flags"
import { useBusinessProfile } from "@/lib/use-business-profile"
import { TIER2_COMPLETE_PLACEHOLDER } from "@/lib/compliance-placeholders"
import {
  getPaymentInstructions,
  getStablecoinPaymentInstructions,
  getTronUsdtPaymentInstructions,
} from "@/lib/payment-instructions"
import {
  ReceiveStablecoinMethodList,
  type StablecoinReceiveMethod,
} from "@/components/receive/ReceiveStablecoinMethodList"
import { fetchWithSession } from "@/lib/fetch-with-session"
import { resolveNgLocalVerification, mapResidenceToLocalPayInCurrency, resolvePayInProvider, type NgLocalIdType, resolveReceiveCountryName, receiveInternationalBankTitle, receiveInternationalDepositSubtitle, receiveLocalBankTitle, receiveLocalMomoTitle, receiveLocalDepositSubtitle } from "@easner/shared"
import { LocalDepositWizard } from "@/components/local-deposit-wizard"
import { NgLocalVerificationNotice } from "@/components/compliance/ng-local-verification-notice"
import {
  prefetchReceiveRails,
  readCachedReceiveRails,
  readCachedReceiveRailsForProvider,
  warmYcLocalDepositCaches,
  type ReceiveRailsResponse,
} from "@/lib/yc-local-deposit-cache"
import { effectivePayInCountry } from "@/lib/pay-in-residence"

function tier1StatusIsInReview(status: string | null | undefined): boolean {
  const s = (status || "").toLowerCase()
  return s === "pending" || s === "in_review" || s === "under_review" || s.includes("review")
}

interface CopyableFieldProps {
  label: string
  value: string
  copiedField: string | null
  fieldId: string
  onCopy: (text: string, field: string) => void
}

function CopyableField({ label, value, copiedField, fieldId, onCopy }: CopyableFieldProps) {
  return (
    <div>
      <p className="text-sm text-muted-foreground mb-1">{label}</p>
      <div className="flex items-center justify-between p-3 bg-muted rounded-lg gap-2">
        <code className="text-sm font-mono break-all flex-1 min-w-0">{value}</code>
        <button
          onClick={() => onCopy(value, fieldId)}
          className="text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
        >
          {copiedField === fieldId ? (
            <Check className="h-4 w-4 text-primary" />
          ) : (
            <Copy className="h-4 w-4" />
          )}
        </button>
      </div>
    </div>
  )
}

function PaymentInstructions({
  currency,
  type,
  stablecoinToken,
}: {
  currency: string
  type: "bank" | "stablecoin"
  /** When set (e.g. live Noah wallet), overrides USD→USDC / EUR→EURC default. */
  stablecoinToken?: string
}) {
  const lines =
    type === "bank"
      ? getPaymentInstructions(currency, "bank")
      : stablecoinToken === "USDT"
        ? getStablecoinPaymentInstructions("USDT")
        : getPaymentInstructions(currency, "stablecoin")

  if (!lines.length) return null

  return (
    <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
      {lines.map((line) => (
        <li key={line}>{line}</li>
      ))}
    </ul>
  )
}

const BUSINESS_ACCOUNT_SCOPE_HEADERS = { "X-Easner-Account-Scope": "business" } as const

interface CurrencyDepositDialogProps {
  account: Account
  copiedField: string | null
  onCopy: (text: string, field: string) => void
}

type CashView = "list" | "bank" | "local"
type LocalRail = "bank_transfer" | "mobile_money"

function BankDepositDetailsPanel({
  account,
  copiedField,
  onCopy,
  onShare,
}: {
  account: Account
  copiedField: string | null
  onCopy: (text: string, field: string) => void
  onShare: () => void
}) {
  return (
    <div className="space-y-4">
      <CopyableField
        label="Account Name"
        value={account.accountName}
        copiedField={copiedField}
        fieldId={`bank-name-${account.id}`}
        onCopy={onCopy}
      />

      {account.currency === "EUR" && account.iban ? (
        <>
          <CopyableField
            label="IBAN"
            value={account.iban}
            copiedField={copiedField}
            fieldId={`bank-iban-${account.id}`}
            onCopy={onCopy}
          />
          {account.bic ? (
            <CopyableField
              label="BIC/SWIFT"
              value={account.bic}
              copiedField={copiedField}
              fieldId={`bank-bic-${account.id}`}
              onCopy={onCopy}
            />
          ) : null}
        </>
      ) : (
        <>
          <CopyableField
            label="Account Number"
            value={account.fullAccountNumber}
            copiedField={copiedField}
            fieldId={`bank-acc-${account.id}`}
            onCopy={onCopy}
          />
          {account.routingNumber ? (
            <CopyableField
              label="Routing Number"
              value={account.routingNumber}
              copiedField={copiedField}
              fieldId={`bank-routing-${account.id}`}
              onCopy={onCopy}
            />
          ) : null}
          {account.sortCode ? (
            <CopyableField
              label="Sort Code"
              value={account.sortCode}
              copiedField={copiedField}
              fieldId={`bank-sort-${account.id}`}
              onCopy={onCopy}
            />
          ) : null}
        </>
      )}

      <CopyableField
        label="Bank Name"
        value={account.bankName}
        copiedField={copiedField}
        fieldId={`bank-bank-${account.id}`}
        onCopy={onCopy}
      />

      <Button variant="outline" size="sm" className="w-full gap-2" onClick={onShare}>
        <Share2 className="h-4 w-4" />
        Share Account Details
      </Button>

      <div className="pt-4 border-t">
        <p className="text-sm font-medium mb-2">Payment Instructions</p>
        <PaymentInstructions currency={account.currency} type="bank" />
      </div>
    </div>
  )
}

export function CurrencyDepositDialog({ account, copiedField, onCopy }: CurrencyDepositDialogProps) {
  const {
    tier1Complete,
    tier1VerificationStatus,
    countryCode,
  } = useBusinessProfile()
  const stablecoinAccount =
    account.stablecoinAddress && account.stablecoinToken
      ? {
          currency: account.currency,
          stablecoin: account.stablecoinToken,
          chain: account.stablecoinChain ?? "Solana",
          address: account.stablecoinAddress,
          memo: "",
        }
      : undefined
  const hasStablecoin = stablecoinAccount !== undefined
  const showBankTab = account.showBankDepositTab ?? !tier1Complete
  const showStablecoinTab = hasStablecoin

  const [residenceCountry, setResidenceCountry] = useState<string | null>(null)
  const [ngMissingType, setNgMissingType] = useState<NgLocalIdType | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [cashView, setCashView] = useState<CashView>("list")
  const [localRail, setLocalRail] = useState<LocalRail | null>(null)
  const [relayDepositMethods, setRelayDepositMethods] = useState<StablecoinReceiveMethod[]>([])
  const [selectedStablecoinMethod, setSelectedStablecoinMethod] = useState<StablecoinReceiveMethod | null>(null)

  useEffect(() => {
    if (!dialogOpen) {
      setSelectedStablecoinMethod(null)
      return
    }
    // Always seed Turnkey Solana method; merge Relay USDT when USD + enabled.
    const base: StablecoinReceiveMethod[] = []
    if (stablecoinAccount?.address) {
      base.push({
        id: account.currency === "EUR" ? "eurc-solana" : "usdc-solana",
        asset: account.currency === "EUR" ? "EURC" : "USDC",
        network: "Solana",
        status: "active",
        address: stablecoinAccount.address,
      })
    }
    if (account.currency !== "USD") {
      setRelayDepositMethods(base)
      return
    }

    let cancelled = false
    void (async () => {
      try {
        // Must match other business wallet reads — without this header the API
        // defaults to individual scope and never returns the org USDT address.
        const res = await fetchWithSession("/api/wallets/relay-deposit-addresses", {
          headers: BUSINESS_ACCOUNT_SCOPE_HEADERS,
        })
        const data = (await res.json().catch(() => ({}))) as {
          enabled?: boolean
          status?: string
          addresses?: Array<{
            asset: string
            network: string
            address: string
          }>
        }
        if (cancelled) return
        const methods = [...base]
        if (res.ok && data.enabled) {
          for (const row of data.addresses ?? []) {
            methods.push({
              id: `relay-${row.asset}-${row.network}`.toLowerCase(),
              asset: row.asset,
              network: row.network,
              status: "active",
              address: row.address,
            })
          }
          if (data.status === "provisioning" && !methods.some((m) => m.asset === "USDT")) {
            methods.push({
              id: "usdt-tron-provisioning",
              asset: "USDT",
              network: "Tron",
              status: "provisioning",
            })
          }
        }
        setRelayDepositMethods(methods)
      } catch {
        if (!cancelled) setRelayDepositMethods(base)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [dialogOpen, account.currency, stablecoinAccount?.address])

  const stablecoinMethods =
    relayDepositMethods.length > 0
      ? relayDepositMethods
      : stablecoinAccount?.address
        ? [
            {
              id: account.currency === "EUR" ? "eurc-solana" : "usdc-solana",
              asset: account.currency === "EUR" ? "EURC" : "USDC",
              network: "Solana",
              status: "active" as const,
              address: stablecoinAccount.address,
            },
          ]
        : []

  const activeStablecoinMethod = selectedStablecoinMethod
  const showStablecoinMethodList = hasStablecoin && !activeStablecoinMethod
  const showStablecoinDetail = hasStablecoin && Boolean(activeStablecoinMethod?.address)

  const effectiveResidence = effectivePayInCountry({
    businessCountryCode: countryCode,
    userResidenceCountry: residenceCountry,
  })
  const localPayInCurrency = useMemo(
    () => (effectiveResidence ? mapResidenceToLocalPayInCurrency(effectiveResidence) : null),
    [effectiveResidence],
  )

  const [receiveRails, setReceiveRails] = useState<ReceiveRailsResponse | null>(() =>
    effectiveResidence && localPayInCurrency
      ? readCachedReceiveRails(effectiveResidence, localPayInCurrency)
      : null,
  )
  const [receiveRailsLoading, setReceiveRailsLoading] = useState(false)

  useEffect(() => {
    if (account.currency !== "USD") return
    let cancelled = false
    void (async () => {
      try {
        const res = await fetchWithSession("/api/compliance/ng-local-verification")
        const data = (await res.json().catch(() => ({}))) as {
          residenceCountry?: string | null
          kycIdType?: string | null
          kycIdNumber?: string | null
          ngLocalIdType?: string | null
          ngLocalIdNumber?: string | null
        }
        if (cancelled || !res.ok) return
        const residence = String(data.residenceCountry ?? "").trim().toUpperCase() || null
        setResidenceCountry(residence)
        const state = resolveNgLocalVerification({
          residenceCountry: residence,
          kycIdType: data.kycIdType,
          kycIdNumber: data.kycIdNumber,
          ngLocalIdType: data.ngLocalIdType,
          ngLocalIdNumber: data.ngLocalIdNumber,
        })
        setNgMissingType(state.missingType)
      } catch {
        // fall back to business countryCode below
      }
    })()
    return () => {
      cancelled = true
    }
  }, [account.currency])

  useEffect(() => {
    if (account.currency !== "USD" || !effectiveResidence || !localPayInCurrency) {
      setReceiveRails(null)
      setReceiveRailsLoading(false)
      return
    }
    let cancelled = false
    void (async () => {
      let payInProvider: "yellowcard" | "grid" | "noah" = "yellowcard"
      try {
        const res = await fetchWithSession(
          `/api/payout-corridors?rail=bank_transfer`,
        )
        const data = (await res.json().catch(() => ({}))) as {
          corridors?: Array<{
            country_code?: string
            currency_code?: string
            metadata?: Record<string, unknown>
            provider_routing?: unknown
          }>
        }
        const row = (data.corridors ?? []).find(
          (c) =>
            String(c.country_code ?? "").toUpperCase() === effectiveResidence &&
            String(c.currency_code ?? "").toUpperCase() === localPayInCurrency,
        )
        if (row) {
          payInProvider = resolvePayInProvider({
            providerRouting: row.provider_routing as never,
            metadata: row.metadata ?? null,
          })
        }
      } catch {
        // default yellowcard
      }
      if (cancelled) return
      const cached = readCachedReceiveRailsForProvider(
        payInProvider,
        effectiveResidence,
        localPayInCurrency,
      )
      if (cached) {
        setReceiveRails(cached)
        setReceiveRailsLoading(false)
      } else {
        setReceiveRailsLoading(true)
      }
      await warmYcLocalDepositCaches({
        residenceCountry: effectiveResidence,
        localPayInCurrency,
        payInProvider,
      })
      const data = await prefetchReceiveRails({
        provider: payInProvider,
        country: effectiveResidence,
        currency: localPayInCurrency,
      })
      if (!cancelled) {
        setReceiveRails(data ?? cached)
        setReceiveRailsLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [account.currency, effectiveResidence, localPayInCurrency])

  const showLocalTab =
    account.currency === "USD" &&
    Boolean(localPayInCurrency) &&
    !(receiveRails != null && !receiveRailsLoading && !receiveRails.anyAvailable)

  const showCashTab = showBankTab || showLocalTab
  const showTabBar = showCashTab && showStablecoinTab
  const defaultTab = showCashTab ? "cash" : "stablecoin"

  const bankAvailable = receiveRails?.rails.bank_transfer.available ?? false
  const momoAvailable = receiveRails?.rails.mobile_money.available ?? false
  const localDepositBlocked = Boolean(localPayInCurrency === "NGN" && ngMissingType)
  const countryName = effectiveResidence ? resolveReceiveCountryName(effectiveResidence) : ""
  const localDepositSubtitle = localPayInCurrency
    ? receiveLocalDepositSubtitle(localPayInCurrency)
    : ""
  const intlBankTitle =
    account.currency === "USD" || account.currency === "EUR"
      ? receiveInternationalBankTitle(account.currency as "USD" | "EUR")
      : "Bank Account"

  const intlBankFlagCode = account.currency === "USD" ? "US" : "EU"

  const resetCashView = () => {
    setCashView("list")
    setLocalRail(null)
  }

  const handleDialogOpenChange = (open: boolean) => {
    setDialogOpen(open)
    if (!open) {
      resetCashView()
      setSelectedStablecoinMethod(null)
    }
  }

  const isNgn = account.currency === "NGN"
  const blockedByAfricanTier = isNgn && !TIER2_COMPLETE_PLACEHOLDER
  /** Mirror mobile Receive: deposit rails require approved verification (not cached artifacts alone). */
  const blockedByGlobalTier = !isNgn && !tier1Complete
  const depositDetailsBlocked = blockedByAfricanTier || blockedByGlobalTier

  const kybInReview =
    blockedByGlobalTier && tier1StatusIsInReview(tier1VerificationStatus)
  const kybRejected =
    blockedByGlobalTier && (tier1VerificationStatus || "").toLowerCase() === "rejected"
  const showVerifyCta = blockedByGlobalTier && !kybInReview

  const blockedTitle = blockedByAfricanTier
    ? "Nigeria local verification required"
    : kybInReview
      ? "Verification in Review"
      : "Complete Verification to get an account"

  const blockedBody = blockedByAfricanTier
    ? "Complete Nigeria local verification (NIN + BVN) to unlock local deposits. This is separate from global account verification."
    : kybInReview
      ? "Your business verification is currently being reviewed."
      : kybRejected
        ? "Your verification could not be completed. Please complete business verification again to receive your account details."
        : "Please complete your business verification to receive bank and stablecoin deposit information."

  const handleShare = async (type: "bank" | "stablecoin" | "local") => {
    const bankDetails =
      type === "bank"
        ? [
            `Account Name: ${account.accountName}`,
            account.iban && `IBAN: ${account.iban}`,
            account.bic && `BIC/SWIFT: ${account.bic}`,
            !account.iban &&
              account.fullAccountNumber &&
              `Account Number: ${account.fullAccountNumber}`,
            account.routingNumber && `Routing Number: ${account.routingNumber}`,
            account.sortCode && `Sort Code: ${account.sortCode}`,
            `Bank Name: ${account.bankName}`,
          ]
            .filter(Boolean)
            .join("\n")
          : type === "local" && effectiveResidence
          ? `Local ${localPayInCurrency} deposit to USD balance`
          : activeStablecoinMethod?.address
            ? [
                `Network: ${activeStablecoinMethod.network === "Solana" ? "SOL" : activeStablecoinMethod.network} • ${activeStablecoinMethod.network}`,
                `${activeStablecoinMethod.asset} Address: ${activeStablecoinMethod.address}`,
              ]
                .filter(Boolean)
                .join("\n")
            : stablecoinAccount
              ? [
                  `Network: SOL • Solana`,
                  `${stablecoinAccount.stablecoin} Address: ${stablecoinAccount.address}`,
                ]
                  .filter(Boolean)
                  .join("\n")
              : ""

    if (navigator.share) {
      try {
        await navigator.share({
          title: `${account.currency} Deposit Details`,
          text: bankDetails,
        })
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          onCopy(bankDetails, "share")
        }
      }
    } else {
      onCopy(bankDetails, "share")
    }
  }

  return (
    <Dialog open={dialogOpen} onOpenChange={handleDialogOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="flex-1 bg-transparent gap-2">
          <Plus className="h-4 w-4" />
          Deposit
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CurrencyFlagCircle currency={account.currency} size={28} />
            {account.currency} Deposit
          </DialogTitle>
          {!depositDetailsBlocked ? (
            <DialogDescription>
              {showLocalTab
                ? `Deposit funds via bank transfer, local currency, or stablecoin. Credits your ${account.currency} balance.`
                : `Deposit funds via bank transfer or stablecoin. Both methods credit your ${account.currency} balance.`}
            </DialogDescription>
          ) : (
            <DialogDescription className="sr-only">
              Business verification is required to view deposit details.
            </DialogDescription>
          )}
        </DialogHeader>

        {depositDetailsBlocked ? (
          <div className="flex flex-col items-center rounded-lg border border-border bg-muted/40 px-4 py-8 text-center">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
              <ShieldCheck className="h-8 w-8 text-primary" strokeWidth={2} />
            </div>
            <p className="text-base font-semibold text-foreground">{blockedTitle}</p>
            <p className="mt-2 max-w-sm text-sm text-muted-foreground">{blockedBody}</p>
            {showVerifyCta || blockedByAfricanTier ? (
              <Button asChild className="mt-6 gap-2">
                <Link href="/settings?tab=verification">
                  Complete Verification
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            ) : null}
          </div>
        ) : (
          <Tabs defaultValue={defaultTab} className="w-full">
            {showTabBar ? (
              <TabsList className="grid w-full grid-cols-2">
                {showCashTab ? <TabsTrigger value="cash">Cash</TabsTrigger> : null}
                {showStablecoinTab ? <TabsTrigger value="stablecoin">Stablecoin</TabsTrigger> : null}
              </TabsList>
            ) : null}

            {showCashTab ? (
              <TabsContent value="cash" className="space-y-4 mt-4">
                {cashView !== "list" ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="gap-2 -ml-2 w-fit"
                    onClick={resetCashView}
                  >
                    <ArrowLeft className="h-4 w-4" />
                    Back
                  </Button>
                ) : null}

                {cashView === "list" ? (
                  <div className="space-y-4">
                    {localPayInCurrency === "NGN" && ngMissingType ? (
                      <NgLocalVerificationNotice
                        missingType={ngMissingType}
                        onSaved={() => setNgMissingType(null)}
                      />
                    ) : null}

                    <div className="flex flex-col gap-3">
                      {showBankTab ? (
                        <button
                          type="button"
                          className="flex w-full items-center gap-4 rounded-xl border border-border p-4 min-h-[76px] hover:bg-muted/50 transition-colors text-left"
                          onClick={() => setCashView("bank")}
                        >
                          <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border/80 bg-muted/40">
                            <CountryFlag code={intlBankFlagCode} size={48} className="size-full rounded-full" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="font-medium">{intlBankTitle}</p>
                            <p className="text-sm text-muted-foreground mt-0.5">
                              {receiveInternationalDepositSubtitle(account.currency)}
                            </p>
                          </div>
                          <ArrowRight className="h-5 w-5 text-muted-foreground shrink-0" />
                        </button>
                      ) : null}

                      {showLocalTab && bankAvailable ? (
                        <button
                          type="button"
                          className="flex w-full items-center gap-4 rounded-xl border border-border p-4 min-h-[76px] hover:bg-muted/50 transition-colors text-left disabled:opacity-55"
                          disabled={localDepositBlocked}
                          onClick={() => {
                            setLocalRail("bank_transfer")
                            setCashView("local")
                          }}
                        >
                          <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border/80 bg-muted/40">
                            <CountryFlag code={effectiveResidence ?? ""} size={48} className="size-full rounded-full" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="font-medium">{receiveLocalBankTitle(countryName)}</p>
                            <p className="text-sm text-muted-foreground mt-0.5">
                              {localDepositSubtitle}
                            </p>
                          </div>
                          <ArrowRight className="h-5 w-5 text-muted-foreground shrink-0" />
                        </button>
                      ) : null}

                      {showLocalTab && momoAvailable ? (
                        <button
                          type="button"
                          className="flex w-full items-center gap-4 rounded-xl border border-border p-4 min-h-[76px] hover:bg-muted/50 transition-colors text-left disabled:opacity-55"
                          disabled={localDepositBlocked}
                          onClick={() => {
                            setLocalRail("mobile_money")
                            setCashView("local")
                          }}
                        >
                          <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border/80 bg-muted/40">
                            <CountryFlag code={effectiveResidence ?? ""} size={48} className="size-full rounded-full" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="font-medium">{receiveLocalMomoTitle(countryName)}</p>
                            <p className="text-sm text-muted-foreground mt-0.5">
                              {localDepositSubtitle}
                            </p>
                          </div>
                          <ArrowRight className="h-5 w-5 text-muted-foreground shrink-0" />
                        </button>
                      ) : null}

                      {showLocalTab &&
                      !receiveRailsLoading &&
                      receiveRails &&
                      !bankAvailable &&
                      !momoAvailable ? (
                        <p className="text-sm text-muted-foreground text-center py-4">
                          Local pay-in is not available for your country right now.
                        </p>
                      ) : null}
                    </div>
                  </div>
                ) : null}

                {cashView === "bank" ? (
                  <BankDepositDetailsPanel
                    account={account}
                    copiedField={copiedField}
                    onCopy={onCopy}
                    onShare={() => handleShare("bank")}
                  />
                ) : null}

                {cashView === "local" && localPayInCurrency && effectiveResidence && localRail ? (
                  <LocalDepositWizard
                    residenceCountry={effectiveResidence}
                    ngMissingType={localPayInCurrency === "NGN" ? ngMissingType : null}
                    onNgSaved={() => setNgMissingType(null)}
                    copiedField={copiedField}
                    onCopy={onCopy}
                    initialRail={localRail}
                    initialStep="amount"
                    onExitToCashList={resetCashView}
                  />
                ) : null}
              </TabsContent>
            ) : null}

            <TabsContent value="stablecoin" className="space-y-4 mt-4">
              {showStablecoinDetail ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="gap-2 -ml-2 w-fit"
                  onClick={() => setSelectedStablecoinMethod(null)}
                >
                  <ArrowLeft className="h-4 w-4" />
                  Back
                </Button>
              ) : null}

              {showStablecoinMethodList ? (
                <ReceiveStablecoinMethodList
                  methods={stablecoinMethods}
                  onSelect={(method) => {
                    if (method.status !== "active" || !method.address) return
                    setSelectedStablecoinMethod(method)
                  }}
                />
              ) : showStablecoinDetail && activeStablecoinMethod ? (
                <>
                  {(() => {
                    const detail = {
                      stablecoin: activeStablecoinMethod.asset,
                      chain: activeStablecoinMethod.network,
                      address: activeStablecoinMethod.address!,
                    }
                    return (
                      <>
                        <div className="flex flex-col items-center">
                          <div className="rounded-xl border bg-white p-4">
                            <QRCodeSVG value={detail.address} size={200} level="M" />
                          </div>
                          <p className="mt-1 text-sm text-muted-foreground">
                            Scan to send {detail.stablecoin} on {detail.chain}
                          </p>
                        </div>

                        <div>
                          <p className="mb-1 text-sm text-muted-foreground">Network</p>
                          <div className="rounded-lg bg-muted p-3">
                            <span className="text-sm font-medium">
                              {detail.chain === "Solana"
                                ? "SOL"
                                : detail.chain === "Ethereum"
                                  ? "ETH"
                                  : detail.chain === "Tron"
                                    ? "TRX"
                                    : detail.chain}
                            </span>
                            <span className="text-sm text-muted-foreground"> • </span>
                            <span className="text-sm text-muted-foreground">{detail.chain}</span>
                          </div>
                        </div>

                        <CopyableField
                          label={`${detail.stablecoin} Address`}
                          value={detail.address}
                          copiedField={copiedField}
                          fieldId={`stable-addr-${account.id}`}
                          onCopy={onCopy}
                        />

                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full gap-2"
                          onClick={() => handleShare("stablecoin")}
                        >
                          <Share2 className="h-4 w-4" />
                          Share {detail.stablecoin} Details
                        </Button>

                        <div className="border-t pt-4">
                          <p className="mb-2 text-sm font-medium">Payment Instructions</p>
                          <PaymentInstructions
                            currency={account.currency}
                            type="stablecoin"
                            stablecoinToken={detail.stablecoin as "USDC" | "USDT"}
                          />
                        </div>
                      </>
                    )
                  })()}
                </>
              ) : (
                <div className="py-8 text-center">
                  <p className="text-sm text-muted-foreground">
                    Stablecoin deposits for {account.currency} are coming soon.
                  </p>
                </div>
              )}
            </TabsContent>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  )
}

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
import { ArrowRight, Copy, Check, Plus, Share2, ShieldCheck } from "lucide-react"
import type { Account } from "@/lib/finance-types"
import { QRCodeSVG } from "qrcode.react"
import { CurrencyFlagCircle } from "@/components/currency-flag-circle"
import { useBusinessProfile } from "@/lib/use-business-profile"
import { TIER2_COMPLETE_PLACEHOLDER } from "@/lib/compliance-placeholders"
import {
  getPaymentInstructions,
  getStablecoinPaymentInstructions,
} from "@/lib/payment-instructions"
import { fetchWithSession } from "@/lib/fetch-with-session"
import { resolveNgLocalVerification, mapResidenceToLocalPayInCurrency, type NgLocalIdType } from "@easner/shared"
import { LocalDepositWizard } from "@/components/local-deposit-wizard"
import {
  prefetchYcReceiveRails,
  readCachedReceiveRails,
  warmYcLocalDepositCaches,
  type ReceiveRailsResponse,
} from "@/lib/yc-local-deposit-cache"

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

interface CurrencyDepositDialogProps {
  account: Account
  copiedField: string | null
  onCopy: (text: string, field: string) => void
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

  const effectiveResidence =
    residenceCountry || String(countryCode ?? "").trim().toUpperCase() || null
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
    const cached = readCachedReceiveRails(effectiveResidence, localPayInCurrency)
    let cancelled = false
    if (cached) {
      setReceiveRails(cached)
      setReceiveRailsLoading(false)
    } else {
      setReceiveRailsLoading(true)
    }
    void warmYcLocalDepositCaches({
      residenceCountry: effectiveResidence,
      localPayInCurrency,
    })
    void (async () => {
      const data = await prefetchYcReceiveRails(effectiveResidence, localPayInCurrency)
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

  const visibleTabCount = [showBankTab, showLocalTab, showStablecoinTab].filter(Boolean).length
  const showTabBar = visibleTabCount > 1
  const defaultTab = showBankTab ? "bank" : showLocalTab ? "local" : "stablecoin"
  const tabColsClass =
    visibleTabCount === 3 ? "grid-cols-3" : visibleTabCount === 2 ? "grid-cols-2" : "grid-cols-1"

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
        ? "Your verification was not approved. Please complete business verification again to receive your account details."
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
    <Dialog>
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
                <Link href="/settings?tab=business">
                  Complete Verification
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            ) : null}
          </div>
        ) : (
          <Tabs defaultValue={defaultTab} className="w-full">
            {showTabBar ? (
              <TabsList className={`grid w-full ${tabColsClass}`}>
                {showBankTab ? (
                  <TabsTrigger value="bank">
                    {account.currency === "USD"
                      ? "US Bank Account"
                      : account.currency === "EUR"
                        ? "EU Bank Account"
                        : "Bank transfer"}
                  </TabsTrigger>
                ) : null}
                {showLocalTab ? (
                  <TabsTrigger value="local">{localPayInCurrency} Deposit</TabsTrigger>
                ) : null}
                {showStablecoinTab ? (
                  <TabsTrigger value="stablecoin">Stablecoin</TabsTrigger>
                ) : null}
              </TabsList>
            ) : null}

            {showBankTab ? (
              <TabsContent value="bank" className="space-y-4 mt-4">
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
                      {account.bic && (
                        <CopyableField
                          label="BIC/SWIFT"
                          value={account.bic}
                          copiedField={copiedField}
                          fieldId={`bank-bic-${account.id}`}
                          onCopy={onCopy}
                        />
                      )}
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
                      {account.routingNumber && (
                        <CopyableField
                          label="Routing Number"
                          value={account.routingNumber}
                          copiedField={copiedField}
                          fieldId={`bank-routing-${account.id}`}
                          onCopy={onCopy}
                        />
                      )}
                      {account.sortCode && (
                        <CopyableField
                          label="Sort Code"
                          value={account.sortCode}
                          copiedField={copiedField}
                          fieldId={`bank-sort-${account.id}`}
                          onCopy={onCopy}
                        />
                      )}
                    </>
                  )}

                  <CopyableField
                    label="Bank Name"
                    value={account.bankName}
                    copiedField={copiedField}
                    fieldId={`bank-bank-${account.id}`}
                    onCopy={onCopy}
                  />
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  className="w-full gap-2"
                  onClick={() => handleShare("bank")}
                >
                  <Share2 className="h-4 w-4" />
                  Share Account Details
                </Button>

                <div className="pt-4 border-t">
                  <p className="text-sm font-medium mb-2">Payment Instructions</p>
                  <PaymentInstructions currency={account.currency} type="bank" />
                </div>
              </TabsContent>
            ) : null}

            {showLocalTab && localPayInCurrency && effectiveResidence ? (
              <TabsContent value="local" className="space-y-4 mt-4">
                <LocalDepositWizard
                  residenceCountry={effectiveResidence}
                  ngMissingType={localPayInCurrency === "NGN" ? ngMissingType : null}
                  onNgSaved={() => setNgMissingType(null)}
                  copiedField={copiedField}
                  onCopy={onCopy}
                />
              </TabsContent>
            ) : null}

            <TabsContent value="stablecoin" className="space-y-4 mt-4">
              {hasStablecoin && stablecoinAccount ? (
                <>
                  <div className="flex flex-col items-center">
                    <div className="p-4 bg-white rounded-xl border">
                      <QRCodeSVG value={stablecoinAccount.address} size={200} level="M" />
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">
                      Scan to send {stablecoinAccount.stablecoin}
                    </p>
                  </div>

                  <div>
                    <p className="text-sm text-muted-foreground mb-1">Network</p>
                    <div className="p-3 bg-muted rounded-lg">
                      <span className="text-sm font-medium">
                        {stablecoinAccount.chain === "Solana"
                          ? "SOL"
                          : stablecoinAccount.chain === "Ethereum"
                            ? "ETH"
                            : stablecoinAccount.chain}
                      </span>
                      <span className="text-sm text-muted-foreground"> • </span>
                      <span className="text-sm text-muted-foreground">{stablecoinAccount.chain}</span>
                    </div>
                  </div>

                  <CopyableField
                    label="Address"
                    value={stablecoinAccount.address}
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
                    Share {stablecoinAccount.stablecoin} Details
                  </Button>

                  <div className="pt-4 border-t">
                    <p className="text-sm font-medium mb-2">Payment Instructions</p>
                    <PaymentInstructions
                      currency={account.currency}
                      type="stablecoin"
                      stablecoinToken={stablecoinAccount?.stablecoin}
                    />
                  </div>
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

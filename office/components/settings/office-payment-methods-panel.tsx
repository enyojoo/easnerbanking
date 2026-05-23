"use client"

import { useState, useEffect, useRef, useCallback, type RefObject } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  Edit,
  Plus,
  Trash2,
  CreditCard,
  QrCode,
  Building2,
  Server,
  Coins,
  MoreHorizontal,
  Upload,
  Loader2,
  X,
} from "lucide-react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { supabase } from "@/lib/supabase"
import { currenciesApi } from "@/lib/currencies-api"
import { paymentMethodsApi } from "@/lib/payment-methods-api"
import {
  getAccountTypeConfigFromCurrency,
  getAccountTypeFromCurrency,
  validateField,
  formatFieldValue,
} from "@/lib/currency-account-types"
import { CurrencyFlag } from "@/components/flags"
import { PlatformControlTabShell } from "@/components/platform-control/platform-tab-shell"

interface PaymentMethod {
  id: string
  currency: string
  type: string
  name: string
  display_logo_url?: string | null
  account_name?: string
  account_number?: string
  bank_name?: string
  routing_number?: string
  sort_code?: string
  iban?: string
  swift_bic?: string
  mobile_money_provider?: string
  phone_number?: string
  qr_code_data?: string
  instructions?: string
  is_default: boolean
  status: string
  completion_timer_seconds?: number
  created_at: string
  updated_at: string
}

interface CurrencyRow {
  id: string
  code: string
  name: string
  symbol: string
  flag_svg: string
  status: string
}

export function OfficePaymentMethodsPanel() {
  const [currencies, setCurrencies] = useState<CurrencyRow[]>([])
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [isAddPaymentMethodOpen, setIsAddPaymentMethodOpen] = useState(false)
  const [isEditPaymentMethodOpen, setIsEditPaymentMethodOpen] = useState(false)
  const [editingPaymentMethod, setEditingPaymentMethod] = useState<PaymentMethod | null>(null)
  const [editingTimer, setEditingTimer] = useState({ hours: 1, minutes: 0, seconds: 0 })
  const [newPaymentMethod, setNewPaymentMethod] = useState({
    currency: "",
    type: "bank_account",
    name: "",
    account_name: "",
    account_number: "",
    bank_name: "",
    routing_number: "",
    sort_code: "",
    iban: "",
    swift_bic: "",
    mobile_money_provider: "",
    phone_number: "",
    qr_code_data: "",
    instructions: "",
    provider_key: "noah",
    stablecoin_wallet: "",
    stablecoin_network: "Solana",
    timerHours: 1,
    timerMinutes: 0,
    timerSeconds: 0,
    is_default: false,
  })

  const [editingProviderKey, setEditingProviderKey] = useState("noah")

  const parseProviderKey = (instructions?: string | null): string => {
    if (!instructions) return "noah"
    try {
      const j = JSON.parse(instructions)
      if (j && typeof j === "object" && typeof (j as any).provider_key === "string") {
        return String((j as any).provider_key)
      }
    } catch {
      // ignore
    }
    return "noah"
  }

  // Add these state variables after the existing state declarations
  const [qrCodeFile, setQrCodeFile] = useState<File | null>(null)
  const [editingQrCodeFile, setEditingQrCodeFile] = useState<File | null>(null)
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [editingLogoFile, setEditingLogoFile] = useState<File | null>(null)
  const [uploadingQrCode, setUploadingQrCode] = useState(false)
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const editFileInputRef = useRef<HTMLInputElement>(null)
  const logoInputRef = useRef<HTMLInputElement>(null)
  const editLogoInputRef = useRef<HTMLInputElement>(null)

  const loadCurrencies = useCallback(async () => {
    try {
      const list = await currenciesApi.list({ scope: "payment-methods" })
      setCurrencies(list)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.error("Error loading currencies:", message)
    }
  }, [])

  const loadPaymentMethods = useCallback(async () => {
    setLoading(true)
    try {
      const list = await paymentMethodsApi.list()
      setPaymentMethods(list)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.error("Error loading payment methods:", message)
    } finally {
      setLoading(false)
    }
  }, [])

  const load = useCallback(async () => {
    await Promise.all([loadCurrencies(), loadPaymentMethods()])
  }, [loadCurrencies, loadPaymentMethods])

  useEffect(() => {
    void load()
  }, [load])

  const handleQrCodeFileSelect = (file: File, isEditing = false) => {
    const allowedTypes = ["image/svg+xml", "image/png", "image/jpeg"]
    if (!allowedTypes.includes(file.type)) {
      console.error("Only SVG, PNG, and JPEG, files are allowed for QR codes")
      return
    }

    if (file.size > 5 * 1024 * 1024) {
      console.error("File size must be less than 5MB")
      return
    }

    if (isEditing) {
      setEditingQrCodeFile(file)
    } else {
      setQrCodeFile(file)
    }
  }

  const uploadQrCodeFile = async (file: File): Promise<string> => {
    const fileExt = file.name.split(".").pop()
    const fileName = `qr_${Date.now()}.${fileExt}`
    const filePath = `qr-codes/${fileName}`

    const { data, error } = await supabase.storage.from("payment-qr-codes").upload(filePath, file, {
      cacheControl: "3600",
      upsert: false,
    })

    if (error) throw error

    const {
      data: { publicUrl },
    } = supabase.storage.from("payment-qr-codes").getPublicUrl(filePath)

    return publicUrl
  }

  const handleLogoFileSelect = (file: File, isEditing = false) => {
    const allowedTypes = ["image/svg+xml", "image/png", "image/jpeg", "image/webp"]
    if (!allowedTypes.includes(file.type)) {
      console.error("Only SVG, PNG, JPEG, and WebP are allowed for display logos")
      return
    }
    if (file.size > 2 * 1024 * 1024) {
      console.error("Logo file size must be less than 2MB")
      return
    }
    if (isEditing) {
      setEditingLogoFile(file)
    } else {
      setLogoFile(file)
    }
  }

  const handleRemoveDisplayLogo = async () => {
    if (!editingPaymentMethod) return
    const url = editingPaymentMethod.display_logo_url?.trim()
    if (!url) {
      setEditingPaymentMethod({ ...editingPaymentMethod, display_logo_url: null })
      setEditingLogoFile(null)
      return
    }
    setUploadingLogo(true)
    try {
      await paymentMethodsApi.deleteDisplayLogo(url)
      setEditingPaymentMethod({ ...editingPaymentMethod, display_logo_url: null })
      setEditingLogoFile(null)
    } catch (error) {
      console.error("Error removing display logo:", error)
    } finally {
      setUploadingLogo(false)
    }
  }

  const renderDisplayLogoField = (opts: {
    isEditing: boolean
    currentUrl?: string | null
    file: File | null
    onClearFile: () => void
    onClearStored?: () => void
    inputRef: RefObject<HTMLInputElement | null>
  }) => (
    <div className="space-y-2">
      <Label>Display logo</Label>
      <input
        type="file"
        ref={opts.inputRef}
        onChange={(e) => {
          const picked = e.target.files?.[0]
          if (picked) handleLogoFileSelect(picked, opts.isEditing)
        }}
        accept=".svg,.png,.jpg,.jpeg,.webp,image/svg+xml,image/png,image/jpeg,image/webp"
        className="hidden"
      />
      <div className="flex flex-wrap items-center gap-4">
        {(opts.file || opts.currentUrl) && (
          <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-md border bg-muted/30">
            {opts.file ? (
              // eslint-disable-next-line @next/next/no-img-element -- blob preview before upload
              <img
                src={URL.createObjectURL(opts.file)}
                alt=""
                className="h-full w-full object-contain"
              />
            ) : opts.currentUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- arbitrary admin-uploaded logo URL
              <img src={opts.currentUrl} alt="" className="h-full w-full object-contain" />
            ) : null}
          </div>
        )}
        <Button
          type="button"
          variant="outline"
          onClick={() => opts.inputRef.current?.click()}
          className="flex items-center gap-2"
        >
          <Upload className="h-4 w-4" />
          {opts.file || opts.currentUrl ? "Change logo" : "Upload logo"}
        </Button>
        {!opts.isEditing && opts.file ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={opts.onClearFile}
            disabled={uploadingLogo}
          >
            Clear file
          </Button>
        ) : null}
        {opts.isEditing && (opts.currentUrl || opts.file) ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              void (async () => {
                if (opts.currentUrl && opts.onClearStored) {
                  await opts.onClearStored()
                }
                opts.onClearFile()
              })()
            }}
            disabled={uploadingLogo}
          >
            Clear
          </Button>
        ) : null}
      </div>
      <p className="text-xs text-muted-foreground">SVG, PNG, JPEG, or WebP (max 2MB)</p>
    </div>
  )

  const handleAddPaymentMethod = async () => {
    setSaving(true)
    try {
      let qrCodeData = newPaymentMethod.qr_code_data

      // Upload QR code file if provided
      if (newPaymentMethod.type === "qr_code" && qrCodeFile) {
        setUploadingQrCode(true)
        qrCodeData = await uploadQrCodeFile(qrCodeFile)
      }

      const instructions =
        newPaymentMethod.type === "provider"
          ? JSON.stringify({ provider_key: newPaymentMethod.provider_key })
          : newPaymentMethod.type === "stablecoin"
            ? JSON.stringify({
                wallet_address: newPaymentMethod.stablecoin_wallet || null,
                network: newPaymentMethod.stablecoin_network || null,
              })
            : newPaymentMethod.instructions

      const completionTimerSeconds = timeToSeconds(
        newPaymentMethod.timerHours,
        newPaymentMethod.timerMinutes,
        newPaymentMethod.timerSeconds,
      )

      let displayLogoUrl: string | null = null
      if (logoFile) {
        setUploadingLogo(true)
        displayLogoUrl = await paymentMethodsApi.uploadDisplayLogo(logoFile)
      }

      const data = await paymentMethodsApi.create({
        currency: newPaymentMethod.currency,
        type: newPaymentMethod.type,
        name: newPaymentMethod.name,
        display_logo_url: displayLogoUrl,
        account_name: newPaymentMethod.type === "bank_account" ? newPaymentMethod.account_name || null : null,
        account_number: newPaymentMethod.type === "bank_account" ? newPaymentMethod.account_number || null : null,
        bank_name: newPaymentMethod.type === "bank_account" ? newPaymentMethod.bank_name || null : null,
        routing_number: newPaymentMethod.type === "bank_account" ? newPaymentMethod.routing_number || null : null,
        sort_code: newPaymentMethod.type === "bank_account" ? newPaymentMethod.sort_code || null : null,
        iban: newPaymentMethod.type === "bank_account" ? newPaymentMethod.iban || null : null,
        swift_bic: newPaymentMethod.type === "bank_account" ? newPaymentMethod.swift_bic || null : null,
        mobile_money_provider: newPaymentMethod.type === "mobile_money" ? newPaymentMethod.mobile_money_provider || null : null,
        phone_number: newPaymentMethod.type === "mobile_money" ? newPaymentMethod.phone_number || null : null,
        qr_code_data:
          newPaymentMethod.type === "qr_code" || newPaymentMethod.type === "stablecoin"
            ? qrCodeData || null
            : null,
        instructions: instructions || null,
        completion_timer_seconds: completionTimerSeconds,
        is_default: newPaymentMethod.is_default,
        status: "active",
      })

      setPaymentMethods([...paymentMethods, data])
      setNewPaymentMethod({
        currency: "",
        type: "bank_account",
        name: "",
        account_name: "",
        account_number: "",
        bank_name: "",
        routing_number: "",
        sort_code: "",
        iban: "",
        swift_bic: "",
        mobile_money_provider: "",
        phone_number: "",
        qr_code_data: "",
        instructions: "",
        provider_key: "noah",
        stablecoin_wallet: "",
        stablecoin_network: "Solana",
        timerHours: 1,
        timerMinutes: 0,
        timerSeconds: 0,
        is_default: false,
      })
      setQrCodeFile(null)
      setLogoFile(null)
      setIsAddPaymentMethodOpen(false)
      console.log("Payment method added successfully")
    } catch (error) {
      console.error("Error adding payment method:", error)
    } finally {
      setSaving(false)
      setUploadingQrCode(false)
      setUploadingLogo(false)
    }
  }

  const handleEditPaymentMethod = async () => {
    if (!editingPaymentMethod) return

    setSaving(true)
    try {
      let qrCodeData = editingPaymentMethod.qr_code_data

      // Upload new QR code file if provided
      if (editingPaymentMethod.type === "qr_code" && editingQrCodeFile) {
        setUploadingQrCode(true)
        qrCodeData = await uploadQrCodeFile(editingQrCodeFile)
      }

      const completionTimerSeconds = timeToSeconds(editingTimer.hours, editingTimer.minutes, editingTimer.seconds)
      const instructions =
        editingPaymentMethod.type === "provider"
          ? JSON.stringify({ provider_key: editingProviderKey })
          : editingPaymentMethod.instructions

      const previousLogoUrl = editingPaymentMethod.display_logo_url?.trim() || null
      let displayLogoUrl = editingPaymentMethod.display_logo_url ?? null
      if (editingLogoFile) {
        setUploadingLogo(true)
        displayLogoUrl = await paymentMethodsApi.uploadDisplayLogo(editingLogoFile)
        if (previousLogoUrl && previousLogoUrl !== displayLogoUrl) {
          await paymentMethodsApi.deleteDisplayLogo(previousLogoUrl).catch((e) => {
            console.error("Error deleting replaced display logo:", e)
          })
        }
      }

      const data = await paymentMethodsApi.patch(editingPaymentMethod.id, {
        currency: editingPaymentMethod.currency,
        type: editingPaymentMethod.type,
        name: editingPaymentMethod.name,
        display_logo_url: displayLogoUrl,
        account_name: editingPaymentMethod.type === "bank_account" ? editingPaymentMethod.account_name || null : null,
        account_number: editingPaymentMethod.type === "bank_account" ? editingPaymentMethod.account_number || null : null,
        bank_name: editingPaymentMethod.type === "bank_account" ? editingPaymentMethod.bank_name || null : null,
        routing_number: editingPaymentMethod.type === "bank_account" ? editingPaymentMethod.routing_number || null : null,
        sort_code: editingPaymentMethod.type === "bank_account" ? editingPaymentMethod.sort_code || null : null,
        iban: editingPaymentMethod.type === "bank_account" ? editingPaymentMethod.iban || null : null,
        swift_bic: editingPaymentMethod.type === "bank_account" ? editingPaymentMethod.swift_bic || null : null,
        mobile_money_provider: editingPaymentMethod.type === "mobile_money" ? editingPaymentMethod.mobile_money_provider || null : null,
        phone_number: editingPaymentMethod.type === "mobile_money" ? editingPaymentMethod.phone_number || null : null,
        qr_code_data: editingPaymentMethod.type === "qr_code" ? qrCodeData || null : null,
        instructions: instructions || null,
        completion_timer_seconds: completionTimerSeconds,
        is_default: editingPaymentMethod.is_default,
      })

      setPaymentMethods(paymentMethods.map((pm) => (pm.id === editingPaymentMethod.id ? data : pm)))
      setEditingPaymentMethod(null)
      setEditingQrCodeFile(null)
      setEditingLogoFile(null)
      setIsEditPaymentMethodOpen(false)
      console.log("Payment method updated successfully")
    } catch (error) {
      console.error("Error updating payment method:", error)
    } finally {
      setSaving(false)
      setUploadingQrCode(false)
      setUploadingLogo(false)
    }
  }

  const handleTogglePaymentMethodStatus = async (id: string) => {
    const method = paymentMethods.find((pm) => pm.id === id)
    if (!method) return

    const newStatus = method.status === "active" ? "inactive" : "active"

    try {
      await paymentMethodsApi.patch(id, { status: newStatus })
      setPaymentMethods(paymentMethods.map((pm) => (pm.id === id ? { ...pm, status: newStatus } : pm)))
      console.log("Payment method status updated successfully")
    } catch (error) {
      console.error("Error updating payment method status:", error)
    }
  }

  const handleSetDefaultPaymentMethod = async (id: string) => {
    const targetMethod = paymentMethods.find((pm) => pm.id === id)
    if (!targetMethod) return

    try {
      await paymentMethodsApi.patch(id, { is_default: true, currency: targetMethod.currency })

      setPaymentMethods(
        paymentMethods.map((pm) => ({
          ...pm,
          is_default: pm.currency === targetMethod.currency ? pm.id === id : pm.is_default,
        })),
      )
      console.log("Default payment method updated successfully")
    } catch (error) {
      console.error("Error setting default payment method:", error)
    }
  }

  const handleDeletePaymentMethod = async (id: string) => {
    const method = paymentMethods.find((pm) => pm.id === id)
    try {
      if (method?.display_logo_url?.trim()) {
        await paymentMethodsApi.deleteDisplayLogo(method.display_logo_url).catch((e) => {
          console.error("Error deleting display logo from storage:", e)
        })
      }
      await paymentMethodsApi.remove(id)
      setPaymentMethods(paymentMethods.filter((pm) => pm.id !== id))
      console.log("Payment method deleted successfully")
    } catch (error) {
      console.error("Error deleting payment method:", error)
    }
  }


  // Helper functions to convert between seconds and hours/minutes/seconds
  const secondsToTime = (totalSeconds: number) => {
    const hours = Math.floor(totalSeconds / 3600)
    const minutes = Math.floor((totalSeconds % 3600) / 60)
    const seconds = totalSeconds % 60
    return { hours, minutes, seconds }
  }

  const timeToSeconds = (hours: number, minutes: number, seconds: number) => {
    return hours * 3600 + minutes * 60 + seconds
  }

  const handleEditClick = (method: PaymentMethod) => {
    setEditingPaymentMethod({ ...method })
    setEditingProviderKey(method.type === "provider" ? parseProviderKey(method.instructions) : "noah")
    const timerSeconds = method.completion_timer_seconds ?? 3600
    setEditingTimer(secondsToTime(timerSeconds))
    setIsEditPaymentMethodOpen(true)
  }


  const getPaymentMethodIcon = (type: string) => {
    if (type === "provider") return <Server className="h-4 w-4" />
    return type === "qr_code" ? <QrCode className="h-4 w-4" /> : <Building2 className="h-4 w-4" />
  }

  const renderCurrencyFlag = (currencyCode: string) => {
    const currency = currencies.find((c) => c.code === currencyCode)
    return (
      <CurrencyFlag
        currency={currencyCode}
        size={20}
        fallbackSvg={currency?.flag_svg?.trim() ? currency.flag_svg : undefined}
      />
    )
  }

  const showTableSkeleton = loading && paymentMethods.length === 0

  return (
    <PlatformControlTabShell
      title="Payment methods"
      description="Instructions shown for manual / ops-assisted payouts. Automated send uses provider routing on Fiat and Crypto tabs."
      actions={
          <Dialog open={isAddPaymentMethodOpen} onOpenChange={setIsAddPaymentMethodOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="h-4 w-4 mr-2" />
                Add payment method
              </Button>
            </DialogTrigger>
        <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Add New Payment Method</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 overflow-y-auto flex-1 pr-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="currency">Currency *</Label>
                <Select
                  value={newPaymentMethod.currency}
                  onValueChange={(value) => setNewPaymentMethod({ ...newPaymentMethod, currency: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select currency" />
                  </SelectTrigger>
                  <SelectContent>
                    {currencies
                      .filter((c) => c.status === "active")
                      .map((currency) => (
                        <SelectItem key={currency.code} value={currency.code}>
                          <div className="flex items-center gap-3">
                            <CurrencyFlag
                              currency={currency.code}
                              size={20}
                              fallbackSvg={currency.flag_svg?.trim() ? currency.flag_svg : undefined}
                            />
                            <div className="font-medium">
                              {currency.code} - {currency.name}
                            </div>
                          </div>
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="type">Type *</Label>
                <Select
                  value={newPaymentMethod.type}
                  onValueChange={(value) => setNewPaymentMethod({ ...newPaymentMethod, type: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="bank_account">
                      <div className="flex items-center gap-2">
                        <Building2 className="h-4 w-4" />
                        Bank Account
                      </div>
                    </SelectItem>
                    <SelectItem value="mobile_money">
                      <div className="flex items-center gap-2">
                        <CreditCard className="h-4 w-4" />
                        Mobile Money
                      </div>
                    </SelectItem>
                    <SelectItem value="qr_code">
                      <div className="flex items-center gap-2">
                        <QrCode className="h-4 w-4" />
                        QR Code
                      </div>
                    </SelectItem>
                    <SelectItem value="stablecoin">
                      <div className="flex items-center gap-2">
                        <Coins className="h-4 w-4" />
                        Stablecoin
                      </div>
                    </SelectItem>
                    <SelectItem value="provider">
                      <div className="flex items-center gap-2">
                        <Server className="h-4 w-4" />
                        Provider (Integrated)
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="name">Display Name *</Label>
              <Input
                id="name"
                value={newPaymentMethod.name}
                onChange={(e) => setNewPaymentMethod({ ...newPaymentMethod, name: e.target.value })}
                placeholder="e.g., M-Pesa, Sberbank Russia"
              />
            </div>

            {renderDisplayLogoField({
              isEditing: false,
              file: logoFile,
              onClearFile: () => setLogoFile(null),
              inputRef: logoInputRef,
            })}

            {newPaymentMethod.type === "bank_account" && (() => {
              const accountConfig = newPaymentMethod.currency
                ? getAccountTypeConfigFromCurrency(newPaymentMethod.currency)
                : null

              if (!accountConfig) {
                return (
                  <div className="text-sm text-gray-500 p-4 bg-gray-50 rounded-lg">
                    Please select a currency first to see the required fields
                  </div>
                )
              }

              return (
                <>
                  {/* Account Name - Always required */}
                  <div className="space-y-2">
                    <Label htmlFor="accountName">
                      {accountConfig.fieldLabels.account_name} *
                    </Label>
                    <Input
                      id="accountName"
                      value={newPaymentMethod.account_name}
                      onChange={(e) =>
                        setNewPaymentMethod({ ...newPaymentMethod, account_name: e.target.value })
                      }
                      placeholder={accountConfig.fieldPlaceholders.account_name}
                    />
                  </div>

                  {/* Bank Name - Always required */}
                  <div className="space-y-2">
                    <Label htmlFor="bankName">
                      {accountConfig.fieldLabels.bank_name} *
                    </Label>
                    <Input
                      id="bankName"
                      value={newPaymentMethod.bank_name}
                      onChange={(e) =>
                        setNewPaymentMethod({ ...newPaymentMethod, bank_name: e.target.value })
                      }
                      placeholder={accountConfig.fieldPlaceholders.bank_name}
                    />
                  </div>

                  {/* US Account Fields */}
                  {accountConfig.accountType === "us" && (
                    <>
                      <div className="space-y-2">
                        <Label htmlFor="routingNumber">
                          {accountConfig.fieldLabels.routing_number} *
                        </Label>
                        <Input
                          id="routingNumber"
                          value={newPaymentMethod.routing_number}
                          onChange={(e) => {
                            const value = e.target.value.replace(/\D/g, "").slice(0, 9)
                            setNewPaymentMethod({ ...newPaymentMethod, routing_number: value })
                          }}
                          placeholder={accountConfig.fieldPlaceholders.routing_number}
                          maxLength={9}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="accountNumber">
                          {accountConfig.fieldLabels.account_number} *
                        </Label>
                        <Input
                          id="accountNumber"
                          value={newPaymentMethod.account_number}
                          onChange={(e) =>
                            setNewPaymentMethod({ ...newPaymentMethod, account_number: e.target.value })
                          }
                          placeholder={accountConfig.fieldPlaceholders.account_number}
                        />
                      </div>
                    </>
                  )}

                  {/* UK Account Fields */}
                  {accountConfig.accountType === "uk" && (
                    <>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="sortCode">
                            {accountConfig.fieldLabels.sort_code} *
                          </Label>
                          <Input
                            id="sortCode"
                            value={newPaymentMethod.sort_code}
                            onChange={(e) => {
                              const value = e.target.value.replace(/\D/g, "").slice(0, 6)
                              setNewPaymentMethod({ ...newPaymentMethod, sort_code: value })
                            }}
                            placeholder={accountConfig.fieldPlaceholders.sort_code}
                            maxLength={6}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="accountNumber">
                            {accountConfig.fieldLabels.account_number} *
                          </Label>
                          <Input
                            id="accountNumber"
                            value={newPaymentMethod.account_number}
                            onChange={(e) =>
                              setNewPaymentMethod({ ...newPaymentMethod, account_number: e.target.value })
                            }
                            placeholder={accountConfig.fieldPlaceholders.account_number}
                          />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="iban">
                          {accountConfig.fieldLabels.iban} (Optional)
                        </Label>
                        <Input
                          id="iban"
                          value={newPaymentMethod.iban}
                          onChange={(e) =>
                            setNewPaymentMethod({ ...newPaymentMethod, iban: e.target.value.toUpperCase() })
                          }
                          placeholder={accountConfig.fieldPlaceholders.iban}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="swiftBic">
                          {accountConfig.fieldLabels.swift_bic} (Optional)
                        </Label>
                        <Input
                          id="swiftBic"
                          value={newPaymentMethod.swift_bic}
                          onChange={(e) =>
                            setNewPaymentMethod({ ...newPaymentMethod, swift_bic: e.target.value.toUpperCase() })
                          }
                          placeholder={accountConfig.fieldPlaceholders.swift_bic}
                        />
                      </div>
                    </>
                  )}

                  {/* EURO Account Fields */}
                  {accountConfig.accountType === "euro" && (
                    <>
                      <div className="space-y-2">
                        <Label htmlFor="iban">
                          {accountConfig.fieldLabels.iban} *
                        </Label>
                        <Input
                          id="iban"
                          value={newPaymentMethod.iban}
                          onChange={(e) =>
                            setNewPaymentMethod({ ...newPaymentMethod, iban: e.target.value.toUpperCase() })
                          }
                          placeholder={accountConfig.fieldPlaceholders.iban}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="swiftBic">
                          {accountConfig.fieldLabels.swift_bic} (Optional)
                        </Label>
                        <Input
                          id="swiftBic"
                          value={newPaymentMethod.swift_bic}
                          onChange={(e) =>
                            setNewPaymentMethod({ ...newPaymentMethod, swift_bic: e.target.value.toUpperCase() })
                          }
                          placeholder={accountConfig.fieldPlaceholders.swift_bic}
                        />
                      </div>
                    </>
                  )}

                  {/* Generic Account Fields */}
                  {accountConfig.accountType === "generic" && (
                    <div className="space-y-2">
                      <Label htmlFor="accountNumber">
                        {accountConfig.fieldLabels.account_number} *
                      </Label>
                      <Input
                        id="accountNumber"
                        value={newPaymentMethod.account_number}
                        onChange={(e) =>
                          setNewPaymentMethod({ ...newPaymentMethod, account_number: e.target.value })
                        }
                        placeholder={accountConfig.fieldPlaceholders.account_number}
                      />
                    </div>
                  )}
                </>
              )
            })()}

            {newPaymentMethod.type === "mobile_money" && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="mmAccountName">Account name *</Label>
                  <Input
                    id="mmAccountName"
                    value={newPaymentMethod.account_name}
                    onChange={(e) => setNewPaymentMethod({ ...newPaymentMethod, account_name: e.target.value })}
                    placeholder="Recipient account name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="mmProvider">Network / Provider *</Label>
                  <Input
                    id="mmProvider"
                    value={newPaymentMethod.mobile_money_provider}
                    onChange={(e) =>
                      setNewPaymentMethod({ ...newPaymentMethod, mobile_money_provider: e.target.value })
                    }
                    placeholder="e.g., MTN, Airtel, M-PESA"
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="mmPhone">Phone number *</Label>
                  <Input
                    id="mmPhone"
                    value={newPaymentMethod.phone_number}
                    onChange={(e) => setNewPaymentMethod({ ...newPaymentMethod, phone_number: e.target.value })}
                    placeholder="+2348012345678"
                  />
                </div>
              </div>
            )}

            {newPaymentMethod.type === "stablecoin" && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="scWallet">Wallet address *</Label>
                  <Input
                    id="scWallet"
                    value={newPaymentMethod.stablecoin_wallet}
                    onChange={(e) =>
                      setNewPaymentMethod({ ...newPaymentMethod, stablecoin_wallet: e.target.value })
                    }
                    placeholder="Deposit wallet address"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="scNetwork">Network *</Label>
                  <Input
                    id="scNetwork"
                    value={newPaymentMethod.stablecoin_network}
                    onChange={(e) =>
                      setNewPaymentMethod({ ...newPaymentMethod, stablecoin_network: e.target.value })
                    }
                    placeholder="Solana, Ethereum, Tron"
                  />
                </div>
              </div>
            )}

            {newPaymentMethod.type === "provider" && (
              <div className="space-y-2">
                <Label>Provider *</Label>
                <Select
                  value={newPaymentMethod.provider_key}
                  onValueChange={(value) =>
                    setNewPaymentMethod({ ...newPaymentMethod, provider_key: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select provider" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="noah">Noah</SelectItem>
                    <SelectItem value="custom">Custom (not implemented)</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-gray-500">
                  Provider methods are used to initiate payouts via API. Configuration is stored in the
                  Payment Method instructions as JSON.
                </p>
              </div>
            )}

            {newPaymentMethod.type === "qr_code" && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="qrCodeFile">Upload QR Code *</Label>
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (file) handleQrCodeFileSelect(file)
                    }}
                    accept=".svg,.png,.jpg,.jpeg,.pdf"
                    className="hidden"
                  />
                  <div className="flex items-center gap-4">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => fileInputRef.current?.click()}
                      className="flex items-center gap-2"
                    >
                      <Upload className="h-4 w-4" />
                      {qrCodeFile ? "Change File" : "Select File"}
                    </Button>
                    {qrCodeFile && (
                      <div className="flex items-center gap-2 text-sm text-gray-600">
                        <span>{qrCodeFile.name}</span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setQrCodeFile(null)}
                          className="h-6 w-6 p-0"
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    )}
                  </div>
                  <p className="text-xs text-gray-500">Supported formats: SVG, PNG, JPEG (Max 5MB)</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="instructions">Instructions</Label>
                  <Textarea
                    id="instructions"
                    value={newPaymentMethod.instructions}
                    onChange={(e) =>
                      setNewPaymentMethod({ ...newPaymentMethod, instructions: e.target.value })
                    }
                    placeholder="Instructions for users on how to use this QR code"
                    rows={3}
                  />
                </div>
              </>
            )}

            <div className="space-y-4 border-t pt-4">
              <Label className="text-sm font-semibold">Completion Timer</Label>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="timerHours">Hours</Label>
                  <Input
                    id="timerHours"
                    type="number"
                    min="0"
                    value={newPaymentMethod.timerHours}
                    onChange={(e) =>
                      setNewPaymentMethod({
                        ...newPaymentMethod,
                        timerHours: Math.max(0, Number.parseInt(e.target.value) || 0),
                      })
                    }
                    placeholder="0"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="timerMinutes">Minutes</Label>
                  <Input
                    id="timerMinutes"
                    type="number"
                    min="0"
                    max="59"
                    value={newPaymentMethod.timerMinutes}
                    onChange={(e) =>
                      setNewPaymentMethod({
                        ...newPaymentMethod,
                        timerMinutes: Math.max(0, Math.min(59, Number.parseInt(e.target.value) || 0)),
                      })
                    }
                    placeholder="0"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="timerSeconds">Seconds</Label>
                  <Input
                    id="timerSeconds"
                    type="number"
                    min="0"
                    max="59"
                    value={newPaymentMethod.timerSeconds}
                    onChange={(e) =>
                      setNewPaymentMethod({
                        ...newPaymentMethod,
                        timerSeconds: Math.max(0, Math.min(59, Number.parseInt(e.target.value) || 0)),
                      })
                    }
                    placeholder="0"
                  />
                </div>
              </div>
              <p className="text-xs text-gray-500">
                Time limit for users to complete the payment (default: 1 hour)
              </p>
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="isDefault"
                checked={newPaymentMethod.is_default}
                onCheckedChange={(checked) =>
                  setNewPaymentMethod({ ...newPaymentMethod, is_default: checked as boolean })
                }
              />
              <Label htmlFor="isDefault" className="text-sm font-medium">
                Set as default payment method for this currency
              </Label>
            </div>

          </div>
          <div className="flex gap-4 pt-4 border-t mt-4">
            <Button variant="outline" onClick={() => setIsAddPaymentMethodOpen(false)} className="flex-1">
              Cancel
            </Button>
            <Button
              onClick={handleAddPaymentMethod}
              disabled={(() => {
                if (saving || uploadingQrCode || uploadingLogo || !newPaymentMethod.currency || !newPaymentMethod.name) {
                  return true
                }

                if (newPaymentMethod.type === "qr_code") {
                  return !qrCodeFile && !newPaymentMethod.qr_code_data
                }

                if (newPaymentMethod.type === "bank_account") {
                  const accountConfig = getAccountTypeConfigFromCurrency(newPaymentMethod.currency)
                  const requiredFields = accountConfig.requiredFields

                  for (const field of requiredFields) {
                    const fieldValue = newPaymentMethod[field as keyof typeof newPaymentMethod]
                    if (!fieldValue || (typeof fieldValue === "string" && !fieldValue.trim())) {
                      return true
                    }
                  }
                }

                return false
              })()}
              className="flex-1 bg-primary hover:bg-primary/90"
            >
              {saving ? "Adding..." : "Add Payment Method"}
            </Button>
          </div>
        </DialogContent>
          </Dialog>
      }
    >
            {/* Edit Payment Method Dialog */}
      <Dialog open={isEditPaymentMethodOpen} onOpenChange={setIsEditPaymentMethodOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Edit Payment Method</DialogTitle>
          </DialogHeader>
          {editingPaymentMethod && (
            <>
              <div className="space-y-4 overflow-y-auto flex-1 pr-2">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="editCurrency">Currency *</Label>
                  <Select
                    value={editingPaymentMethod.currency}
                    onValueChange={(value) =>
                      setEditingPaymentMethod({ ...editingPaymentMethod, currency: value })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select currency" />
                    </SelectTrigger>
                    <SelectContent>
                      {currencies
                        .filter((c) => c.status === "active")
                        .map((currency) => (
                          <SelectItem key={currency.code} value={currency.code}>
                            <div className="flex items-center gap-3">
                              <CurrencyFlag
                                currency={currency.code}
                                size={20}
                                fallbackSvg={currency.flag_svg?.trim() ? currency.flag_svg : undefined}
                              />
                              <div className="font-medium">
                                {currency.code} - {currency.name}
                              </div>
                            </div>
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="editType">Type *</Label>
                  <Select
                    value={editingPaymentMethod.type}
                    onValueChange={(value) =>
                      setEditingPaymentMethod({ ...editingPaymentMethod, type: value })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="bank_account">
                        <div className="flex items-center gap-2">
                          <Building2 className="h-4 w-4" />
                          Bank Account
                        </div>
                      </SelectItem>
                        <SelectItem value="mobile_money">
                          <div className="flex items-center gap-2">
                            <CreditCard className="h-4 w-4" />
                            Mobile Money
                          </div>
                        </SelectItem>
                      <SelectItem value="qr_code">
                        <div className="flex items-center gap-2">
                          <QrCode className="h-4 w-4" />
                          QR Code
                        </div>
                      </SelectItem>
                        <SelectItem value="provider">
                          <div className="flex items-center gap-2">
                            <Server className="h-4 w-4" />
                            Provider (Integrated)
                          </div>
                        </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="editName">Display Name *</Label>
                <Input
                  id="editName"
                  value={editingPaymentMethod.name}
                  onChange={(e) =>
                    setEditingPaymentMethod({ ...editingPaymentMethod, name: e.target.value })
                  }
                  placeholder="e.g., M-Pesa, Sberbank Russia"
                />
              </div>

              {renderDisplayLogoField({
                isEditing: true,
                currentUrl: editingPaymentMethod.display_logo_url,
                file: editingLogoFile,
                onClearFile: () => setEditingLogoFile(null),
                onClearStored: () => void handleRemoveDisplayLogo(),
                inputRef: editLogoInputRef,
              })}

                {editingPaymentMethod.type === "bank_account" && (() => {
                const accountConfig = editingPaymentMethod.currency
                  ? getAccountTypeConfigFromCurrency(editingPaymentMethod.currency)
                  : null

                if (!accountConfig) {
                  return (
                    <div className="text-sm text-gray-500 p-4 bg-gray-50 rounded-lg">
                      Please select a currency first to see the required fields
                    </div>
                  )
                }

                return (
                  <>
                    {/* Account Name - Always required */}
                    <div className="space-y-2">
                      <Label htmlFor="editAccountName">
                        {accountConfig.fieldLabels.account_name} *
                      </Label>
                      <Input
                        id="editAccountName"
                        value={editingPaymentMethod.account_name || ""}
                        onChange={(e) =>
                          setEditingPaymentMethod({ ...editingPaymentMethod, account_name: e.target.value })
                        }
                        placeholder={accountConfig.fieldPlaceholders.account_name}
                      />
                    </div>

                    {/* Bank Name - Always required */}
                    <div className="space-y-2">
                      <Label htmlFor="editBankName">
                        {accountConfig.fieldLabels.bank_name} *
                      </Label>
                      <Input
                        id="editBankName"
                        value={editingPaymentMethod.bank_name || ""}
                        onChange={(e) =>
                          setEditingPaymentMethod({ ...editingPaymentMethod, bank_name: e.target.value })
                        }
                        placeholder={accountConfig.fieldPlaceholders.bank_name}
                      />
                    </div>

                    {/* US Account Fields */}
                    {accountConfig.accountType === "us" && (
                      <>
                        <div className="space-y-2">
                          <Label htmlFor="editRoutingNumber">
                            {accountConfig.fieldLabels.routing_number} *
                          </Label>
                          <Input
                            id="editRoutingNumber"
                            value={editingPaymentMethod.routing_number || ""}
                            onChange={(e) => {
                              const value = e.target.value.replace(/\D/g, "").slice(0, 9)
                              setEditingPaymentMethod({ ...editingPaymentMethod, routing_number: value })
                            }}
                            placeholder={accountConfig.fieldPlaceholders.routing_number}
                            maxLength={9}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="editAccountNumber">
                            {accountConfig.fieldLabels.account_number} *
                          </Label>
                          <Input
                            id="editAccountNumber"
                            value={editingPaymentMethod.account_number || ""}
                            onChange={(e) =>
                              setEditingPaymentMethod({
                                ...editingPaymentMethod,
                                account_number: e.target.value,
                              })
                            }
                            placeholder={accountConfig.fieldPlaceholders.account_number}
                          />
                        </div>
                      </>
                    )}

                    {/* UK Account Fields */}
                    {accountConfig.accountType === "uk" && (
                      <>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label htmlFor="editSortCode">
                              {accountConfig.fieldLabels.sort_code} *
                            </Label>
                            <Input
                              id="editSortCode"
                              value={editingPaymentMethod.sort_code || ""}
                              onChange={(e) => {
                                const value = e.target.value.replace(/\D/g, "").slice(0, 6)
                                setEditingPaymentMethod({ ...editingPaymentMethod, sort_code: value })
                              }}
                              placeholder={accountConfig.fieldPlaceholders.sort_code}
                              maxLength={6}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="editAccountNumber">
                              {accountConfig.fieldLabels.account_number} *
                            </Label>
                            <Input
                              id="editAccountNumber"
                              value={editingPaymentMethod.account_number || ""}
                              onChange={(e) =>
                                setEditingPaymentMethod({
                                  ...editingPaymentMethod,
                                  account_number: e.target.value,
                                })
                              }
                              placeholder={accountConfig.fieldPlaceholders.account_number}
                            />
                          </div>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="editIban">
                            {accountConfig.fieldLabels.iban} (Optional)
                          </Label>
                          <Input
                            id="editIban"
                            value={editingPaymentMethod.iban || ""}
                            onChange={(e) =>
                              setEditingPaymentMethod({
                                ...editingPaymentMethod,
                                iban: e.target.value.toUpperCase(),
                              })
                            }
                            placeholder={accountConfig.fieldPlaceholders.iban}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="editSwiftBic">
                            {accountConfig.fieldLabels.swift_bic} (Optional)
                          </Label>
                          <Input
                            id="editSwiftBic"
                            value={editingPaymentMethod.swift_bic || ""}
                            onChange={(e) =>
                              setEditingPaymentMethod({
                                ...editingPaymentMethod,
                                swift_bic: e.target.value.toUpperCase(),
                              })
                            }
                            placeholder={accountConfig.fieldPlaceholders.swift_bic}
                          />
                        </div>
                      </>
                    )}

                    {/* EURO Account Fields */}
                    {accountConfig.accountType === "euro" && (
                      <>
                        <div className="space-y-2">
                          <Label htmlFor="editIban">
                            {accountConfig.fieldLabels.iban} *
                          </Label>
                          <Input
                            id="editIban"
                            value={editingPaymentMethod.iban || ""}
                            onChange={(e) =>
                              setEditingPaymentMethod({
                                ...editingPaymentMethod,
                                iban: e.target.value.toUpperCase(),
                              })
                            }
                            placeholder={accountConfig.fieldPlaceholders.iban}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="editSwiftBic">
                            {accountConfig.fieldLabels.swift_bic} (Optional)
                          </Label>
                          <Input
                            id="editSwiftBic"
                            value={editingPaymentMethod.swift_bic || ""}
                            onChange={(e) =>
                              setEditingPaymentMethod({
                                ...editingPaymentMethod,
                                swift_bic: e.target.value.toUpperCase(),
                              })
                            }
                            placeholder={accountConfig.fieldPlaceholders.swift_bic}
                          />
                        </div>
                      </>
                    )}

                    {/* Generic Account Fields */}
                    {accountConfig.accountType === "generic" && (
                      <div className="space-y-2">
                        <Label htmlFor="editAccountNumber">
                          {accountConfig.fieldLabels.account_number} *
                        </Label>
                        <Input
                          id="editAccountNumber"
                          value={editingPaymentMethod.account_number || ""}
                          onChange={(e) =>
                            setEditingPaymentMethod({
                              ...editingPaymentMethod,
                              account_number: e.target.value,
                            })
                          }
                          placeholder={accountConfig.fieldPlaceholders.account_number}
                        />
                      </div>
                    )}
                  </>
                )
              })()}

                {editingPaymentMethod.type === "mobile_money" && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Account name *</Label>
                      <Input
                        value={editingPaymentMethod.account_name || ""}
                        onChange={(e) =>
                          setEditingPaymentMethod({ ...editingPaymentMethod, account_name: e.target.value })
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Network / Provider *</Label>
                      <Input
                        value={editingPaymentMethod.mobile_money_provider || ""}
                        onChange={(e) =>
                          setEditingPaymentMethod({
                            ...editingPaymentMethod,
                            mobile_money_provider: e.target.value,
                          })
                        }
                      />
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <Label>Phone number *</Label>
                      <Input
                        value={editingPaymentMethod.phone_number || ""}
                        onChange={(e) =>
                          setEditingPaymentMethod({ ...editingPaymentMethod, phone_number: e.target.value })
                        }
                      />
                    </div>
                  </div>
                )}

                {editingPaymentMethod.type === "provider" && (
                  <div className="space-y-2">
                    <Label>Provider *</Label>
                    <Select
                      value={editingProviderKey}
                      onValueChange={(value) => {
                        setEditingProviderKey(value)
                        setEditingPaymentMethod({
                          ...editingPaymentMethod,
                          instructions: JSON.stringify({ provider_key: value }),
                        })
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select provider" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="noah">Noah</SelectItem>
                        <SelectItem value="custom">Custom (not implemented)</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-gray-500">
                      Provider configuration is stored in instructions as JSON (e.g.{" "}
                      {`{"provider_key":"noah"}`}).
                    </p>
                  </div>
                )}

              {editingPaymentMethod.type === "qr_code" && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="editQrCodeFile">Upload QR Code *</Label>
                    <input
                      type="file"
                      ref={editFileInputRef}
                      onChange={(e) => {
                        const file = e.target.files?.[0]
                        if (file) handleQrCodeFileSelect(file, true)
                      }}
                      accept=".svg,.png,.jpg,.jpeg,.pdf"
                      className="hidden"
                    />
                    <div className="flex items-center gap-4">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => editFileInputRef.current?.click()}
                        className="flex items-center gap-2"
                      >
                        <Upload className="h-4 w-4" />
                        {editingQrCodeFile
                          ? "Change File"
                          : editingPaymentMethod.qr_code_data
                            ? "Replace File"
                            : "Select File"}
                      </Button>
                      {editingQrCodeFile && (
                        <div className="flex items-center gap-2 text-sm text-gray-600">
                          <span>{editingQrCodeFile.name}</span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => setEditingQrCodeFile(null)}
                            className="h-6 w-6 p-0"
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      )}
                      {!editingQrCodeFile && editingPaymentMethod.qr_code_data && (
                        <span className="text-sm text-gray-600">Current file uploaded</span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500">
                      Supported formats: SVG, PNG, JPEG (Max 5MB)
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="editInstructions">Instructions</Label>
                    <Textarea
                      id="editInstructions"
                      value={editingPaymentMethod.instructions || ""}
                      onChange={(e) =>
                        setEditingPaymentMethod({ ...editingPaymentMethod, instructions: e.target.value })
                      }
                      placeholder="Instructions for users on how to use this QR code"
                      rows={3}
                    />
                  </div>
                </>
              )}

              <div className="space-y-4 border-t pt-4">
                <Label className="text-sm font-semibold">Completion Timer</Label>
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="editTimerHours">Hours</Label>
                    <Input
                      id="editTimerHours"
                      type="number"
                      min="0"
                      value={editingTimer.hours}
                      onChange={(e) =>
                        setEditingTimer({
                          ...editingTimer,
                          hours: Math.max(0, Number.parseInt(e.target.value) || 0),
                        })
                      }
                      placeholder="0"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="editTimerMinutes">Minutes</Label>
                    <Input
                      id="editTimerMinutes"
                      type="number"
                      min="0"
                      max="59"
                      value={editingTimer.minutes}
                      onChange={(e) =>
                        setEditingTimer({
                          ...editingTimer,
                          minutes: Math.max(0, Math.min(59, Number.parseInt(e.target.value) || 0)),
                        })
                      }
                      placeholder="0"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="editTimerSeconds">Seconds</Label>
                    <Input
                      id="editTimerSeconds"
                      type="number"
                      min="0"
                      max="59"
                      value={editingTimer.seconds}
                      onChange={(e) =>
                        setEditingTimer({
                          ...editingTimer,
                          seconds: Math.max(0, Math.min(59, Number.parseInt(e.target.value) || 0)),
                        })
                      }
                      placeholder="0"
                    />
                  </div>
                </div>
                <p className="text-xs text-gray-500">
                  Time limit for users to complete the payment (default: 1 hour)
                </p>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="editIsDefault"
                  checked={editingPaymentMethod.is_default}
                  onCheckedChange={(checked) =>
                    setEditingPaymentMethod({ ...editingPaymentMethod, is_default: checked as boolean })
                  }
                />
                <Label htmlFor="editIsDefault" className="text-sm font-medium">
                  Set as default payment method for this currency
                </Label>
              </div>

              </div>
              <div className="flex gap-4 pt-4 border-t mt-4">
                <Button
                  variant="outline"
                  onClick={() => setIsEditPaymentMethodOpen(false)}
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleEditPaymentMethod}
                  disabled={(() => {
                    if (
                      saving ||
                      uploadingQrCode ||
                      uploadingLogo ||
                      !editingPaymentMethod.currency ||
                      !editingPaymentMethod.name
                    ) {
                      return true
                    }

                    if (editingPaymentMethod.type === "qr_code") {
                      return !editingQrCodeFile && !editingPaymentMethod.qr_code_data
                    }

                    if (editingPaymentMethod.type === "bank_account") {
                      const accountConfig = getAccountTypeConfigFromCurrency(
                        editingPaymentMethod.currency
                      )
                      const requiredFields = accountConfig.requiredFields

                      for (const field of requiredFields) {
                        const fieldValue = editingPaymentMethod[field as keyof typeof editingPaymentMethod]
                        if (!fieldValue || (typeof fieldValue === "string" && !fieldValue.trim())) {
                          return true
                        }
                      }
                    }

                    return false
                  })()}
                  className="flex-1 bg-primary hover:bg-primary/90"
                >
                  {saving ? "Saving..." : "Save Changes"}
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Card>
        {showTableSkeleton ? (
          <CardContent>
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading…
            </div>
          </CardContent>
        ) : (
  <CardContent className="p-0">
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Currency</TableHead>
          <TableHead>Type</TableHead>
          <TableHead>Name</TableHead>
          <TableHead>Details</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Default</TableHead>
          <TableHead>Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {paymentMethods.map((method) => (
          <TableRow key={method.id}>
            <TableCell>
              <div className="flex items-center gap-2">
                {renderCurrencyFlag(method.currency)}
                <span className="font-medium">{method.currency}</span>
              </div>
            </TableCell>
            <TableCell>
              <div className="flex items-center gap-2">
                {getPaymentMethodIcon(method.type)}
                <span className="capitalize">{method.type.replace("_", " ")}</span>
              </div>
            </TableCell>
            <TableCell>
              <div className="flex items-center gap-2 font-medium">
                {method.display_logo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element -- arbitrary admin-uploaded logo URL
                  <img
                    src={method.display_logo_url}
                    alt=""
                    className="h-8 w-8 shrink-0 rounded object-contain border bg-muted/30"
                  />
                ) : null}
                <span>{method.name}</span>
              </div>
            </TableCell>
            <TableCell>
              {method.type === "bank_account" ? (() => {
                const accountConfig = getAccountTypeConfigFromCurrency(method.currency)
                const accountType = accountConfig.accountType

                return (
                  <div className="text-sm text-gray-600 space-y-1">
                    <div>{method.account_name}</div>
                    {accountType === "us" && method.routing_number && (
                      <div className="font-mono text-xs">
                        Routing: {formatFieldValue(accountType, "routing_number", method.routing_number)}
                      </div>
                    )}
                    {accountType === "uk" && method.sort_code && (
                      <div className="font-mono text-xs">
                        Sort Code: {formatFieldValue(accountType, "sort_code", method.sort_code)}
                      </div>
                    )}
                    {method.account_number && (
                      <div className="font-mono text-xs">
                        {accountConfig.fieldLabels.account_number}: {method.account_number}
                      </div>
                    )}
                    {method.iban && (
                      <div className="font-mono text-xs">
                        IBAN: {formatFieldValue(accountType, "iban", method.iban)}
                      </div>
                    )}
                    {method.swift_bic && (
                      <div className="font-mono text-xs">SWIFT/BIC: {method.swift_bic}</div>
                    )}
                    <div>{method.bank_name}</div>
                  </div>
                )
              })() : (
                <div className="text-sm text-gray-600">
                  <div className="font-mono text-xs">{method.qr_code_data}</div>
                  {method.instructions && (
                    <div className="mt-1 text-xs">{method.instructions.substring(0, 50)}...</div>
                  )}
                </div>
              )}
            </TableCell>
            <TableCell>
              <Badge variant={method.status === "active" ? "emerald" : "slate"}>
                {method.status}
              </Badge>
            </TableCell>
            <TableCell>
              {method.is_default && <Badge variant="outline">Default</Badge>}
            </TableCell>
            <TableCell>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => handleEditClick(method)}>
                    <Edit className="h-4 w-4 mr-2" />
                    Edit
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleTogglePaymentMethodStatus(method.id)}>
                    {method.status === "active" ? "Disable" : "Enable"}
                  </DropdownMenuItem>
                  {method.status === "active" && !method.is_default && (
                    <DropdownMenuItem onClick={() => handleSetDefaultPaymentMethod(method.id)}>
                      Make Default
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem
                    onClick={() => handleDeletePaymentMethod(method.id)}
                    className="text-destructive focus:text-destructive"
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>

    {paymentMethods.length === 0 ? (
      <div className="text-center py-8 text-gray-500">
        <CreditCard className="h-12 w-12 mx-auto mb-4 text-gray-300" />
        <p>No payment methods configured yet</p>
        <p className="text-sm">Add payment methods to enable user transactions</p>
      </div>
    ) : null}
  </CardContent>
        )}
      </Card>
    </PlatformControlTabShell>
  )
}

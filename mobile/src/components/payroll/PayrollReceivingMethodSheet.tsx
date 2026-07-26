import React, { useEffect, useMemo, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { Building2, Check, ChevronDown, ChevronUp, Search, Smartphone, Wallet, X } from 'lucide-react-native'
import { MobileMoneyProviderIcon } from '@easner/shared'
import { WebAwareModal } from '../WebAwareModal'
import { Button } from '../ui'
import { apiFetch } from '../../query/api-client'
import { useSendDestinations } from '../../hooks/useSendDestinations'
import {
  buildRecipientCatalogForType,
  getCorridorRecipientOptions,
  type RecipientCatalogEntry,
  type RecipientFieldKey,
} from '../../lib/recipientCatalog'
import {
  borderRadius,
  colors,
  compactFormInputStyle,
  dropdownSearchInputStyle,
  dropdownSearchRowStyle,
  fontFamily,
  spacing,
  surfaceFrameStyle,
  textStyles,
} from '../../theme'
import { CountryFlag } from '../flags/CountryFlag'
import { CachedImage } from '../CachedImage'
import { getNetworkIconUrl, getTokenIconUrl } from '../../lib/cryptoIcons'
import RecipientFormDropdownList from '../recipients/RecipientFormDropdownList'
import { RecipientFormDropdownHost, RegisterRecipientDropdownSheet } from '../recipients/RecipientFormDropdownHost'
import { RecipientBankNameField } from '../recipients/RecipientBankNameField'
import { WalletAddressField } from '../recipients/WalletAddressField'
import { EmbeddedWalletAddressQrScanner } from '../recipients/WalletAddressQrScanner'
import { formatAccountNumber, formatIBAN, formatRoutingNumber, formatSortCode } from '../../utils/formatters'
import { resolvePayrollReceivingDestination } from '../../features/payroll/receivingMethodDefaults'
import { useAuth } from '../../contexts/AuthContext'

export type PayrollExternalMethodType = 'bank' | 'mobile_money' | 'stablecoin'

export type PayrollReceivingMethodResult = {
  id: string
  type: PayrollExternalMethodType
  label: string
  details: Record<string, string>
  preferred: boolean
}

type ExistingMethod = {
  id: string
  type: PayrollExternalMethodType
  label: string
  details?: Record<string, string>
}

type Props = {
  visible: boolean
  invitationId?: string
  connectionId?: string
  editingMethod?: ExistingMethod | null
  onClose: () => void
  onSaved: (method: PayrollReceivingMethodResult) => void | Promise<void>
}

const TYPE_OPTIONS: Array<{
  type: PayrollExternalMethodType
  title: string
  description: string
  icon: typeof Building2
}> = [
  {
    type: 'bank',
    title: 'Bank account',
    description: 'Receive payroll in a bank account',
    icon: Building2,
  },
  {
    type: 'mobile_money',
    title: 'Mobile money',
    description: 'Receive payroll through a mobile-money account',
    icon: Smartphone,
  },
  {
    type: 'stablecoin',
    title: 'Wallet address',
    description: 'Receive stablecoins at a wallet address',
    icon: Wallet,
  },
]

function methodTitle(type: PayrollExternalMethodType): string {
  if (type === 'bank') return 'Bank account'
  if (type === 'mobile_money') return 'Mobile money'
  return 'Wallet address'
}

function resultFromApi(value: Record<string, unknown>, preferred: boolean): PayrollReceivingMethodResult {
  return {
    id: String(value.id),
    type: String(value.type) as PayrollExternalMethodType,
    label: String(value.label || methodTitle(String(value.type) as PayrollExternalMethodType)),
    details: (value.details ?? {}) as Record<string, string>,
    preferred,
  }
}

export function PayrollReceivingMethodSheet({
  visible,
  invitationId,
  connectionId,
  editingMethod,
  onClose,
  onSaved,
}: Props) {
  const { userProfile } = useAuth()
  const { bankCorridors, mobileCorridors, cryptoDestinations, catalogRevision } = useSendDestinations()
  const [selectedType, setSelectedType] = useState<PayrollExternalMethodType | null>(null)
  const [selectedDestination, setSelectedDestination] = useState<RecipientCatalogEntry | null>(null)
  const [fields, setFields] = useState<Record<string, string>>({})
  const [destinationOpen, setDestinationOpen] = useState(false)
  const [destinationSearch, setDestinationSearch] = useState('')
  const [providerOpen, setProviderOpen] = useState(false)
  const [providerSearch, setProviderSearch] = useState('')
  const [bankOpen, setBankOpen] = useState(false)
  const [bankSearch, setBankSearch] = useState('')
  const [showWalletScanner, setShowWalletScanner] = useState(false)
  const [reviewing, setReviewing] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [loadingExisting, setLoadingExisting] = useState(false)
  const [error, setError] = useState('')

  const catalogType = selectedType === 'stablecoin' ? 'wallet' : selectedType
  const destinations = useMemo(
    () =>
      catalogType
        ? buildRecipientCatalogForType(catalogType, {
            bank: bankCorridors,
            mobile: mobileCorridors,
            crypto: cryptoDestinations,
          })
        : [],
    [bankCorridors, catalogRevision, catalogType, cryptoDestinations, mobileCorridors],
  )
  const visibleDestinations = useMemo(() => {
    const query = destinationSearch.trim().toLowerCase()
    if (!query) return destinations
    return destinations.filter((item) =>
      `${item.countryName} ${item.countryCode} ${item.currencyName} ${item.currencyCode}`.toLowerCase().includes(query),
    )
  }, [destinationSearch, destinations])

  const residenceCountry = String(
    editingMethod?.details?.countryCode ??
      userProfile?.residence_country ??
      userProfile?.profile?.residence_country ??
      userProfile?.profile?.country_code ??
      '',
  )
  const savedDestination = useMemo(() => {
    if (!editingMethod) return null
    const countryCode = String(editingMethod.details?.countryCode || '').trim().toUpperCase()
    const currencyCode = String(
      editingMethod.details?.asset || editingMethod.details?.currency || '',
    ).trim().toUpperCase()
    if (!currencyCode) return null
    return destinations.find((destination) => (
      destination.currencyCode.toUpperCase() === currencyCode &&
      (!countryCode || destination.countryCode.toUpperCase() === countryCode)
    )) ?? null
  }, [destinations, editingMethod])
  const effectiveDestination = useMemo(
    () =>
      selectedType
        ? resolvePayrollReceivingDestination({
            type: selectedType,
            destinations,
            residenceCountry,
            current: selectedDestination ?? savedDestination,
          })
        : null,
    [destinations, residenceCountry, savedDestination, selectedDestination, selectedType],
  )

  useEffect(() => {
    if (!visible || !selectedType || !effectiveDestination || selectedDestination) return
    setSelectedDestination(effectiveDestination)
  }, [effectiveDestination, selectedDestination, selectedType, visible])

  useEffect(() => {
    if (!visible) return
    const type = editingMethod?.type ?? null
    setSelectedType(type)
    setSelectedDestination(null)
    setFields({})
    setDestinationOpen(false)
    setDestinationSearch('')
    setProviderOpen(false)
    setProviderSearch('')
    setBankOpen(false)
    setBankSearch('')
    setShowWalletScanner(false)
    setReviewing(false)
    setSubmitting(false)
    setError('')
  }, [editingMethod?.id, editingMethod?.type, visible])

  useEffect(() => {
    if (!visible || !connectionId || !editingMethod?.id) return
    let active = true
    setLoadingExisting(true)
    apiFetch<{ method: { details?: Record<string, string> } }>(
      `/api/payroll/connections/${connectionId}/methods/${editingMethod.id}`,
    )
      .then((response) => {
        if (!active) return
        setFields(response.method.details ?? {})
      })
      .catch((caught) => {
        if (!active) return
        setError(caught instanceof Error ? caught.message : 'Could not load receiving details')
      })
      .finally(() => {
        if (active) setLoadingExisting(false)
      })
    return () => {
      active = false
    }
  }, [connectionId, editingMethod?.id, visible])

  const formFields = effectiveDestination?.fields ?? []
  const providerOptions = useMemo(() => {
    if (!effectiveDestination) return []
    if (selectedType === 'mobile_money') {
      const options = getCorridorRecipientOptions({
        countryCode: effectiveDestination.countryCode,
        currencyCode: effectiveDestination.currencyCode,
        rail: 'mobile_money',
      }).momoOptions
      if (options.length) return options
    }
    return effectiveDestination.providers ?? []
  }, [catalogRevision, effectiveDestination, selectedType])
  const bankOptions = useMemo(() => {
    if (selectedType !== 'bank' || !effectiveDestination) return []
    return getCorridorRecipientOptions({
      countryCode: effectiveDestination.countryCode,
      currencyCode: effectiveDestination.currencyCode,
      rail: 'bank_transfer',
    }).bankOptions
  }, [catalogRevision, effectiveDestination, selectedType])
  const filteredProviderOptions = useMemo(() => {
    const query = providerSearch.trim().toLowerCase()
    return providerOptions.filter((option) => !query || option.toLowerCase().includes(query))
  }, [providerOptions, providerSearch])
  const formComplete = Boolean(
    effectiveDestination && formFields.every((field) => !field.required || String(fields[field.key] ?? '').trim()),
  )

  useEffect(() => {
    if (!visible || !effectiveDestination || providerOptions.length === 0) return
    const field = selectedType === 'mobile_money' ? 'provider' : selectedType === 'stablecoin' ? 'network' : null
    if (!field) return
    setFields((current) => current[field] ? current : { ...current, [field]: providerOptions[0] })
  }, [effectiveDestination, providerOptions, selectedType, visible])

  function chooseType(type: PayrollExternalMethodType) {
    setSelectedType(type)
    setSelectedDestination(null)
    setFields({})
    setDestinationOpen(false)
    setProviderOpen(false)
    setBankOpen(false)
    setReviewing(false)
    setError('')
  }

  function chooseDestination(destination: RecipientCatalogEntry) {
    setSelectedDestination(destination)
    setFields({})
    setDestinationOpen(false)
    setDestinationSearch('')
    setProviderOpen(false)
    setProviderSearch('')
    setBankOpen(false)
    setBankSearch('')
    setReviewing(false)
    setError('')
  }

  function updateField(key: RecipientFieldKey | string, value: string) {
    const formatted =
      key === 'routingNumber'
        ? formatRoutingNumber(value)
        : key === 'sortCode'
          ? formatSortCode(value)
          : key === 'accountNumber'
            ? formatAccountNumber(value)
            : key === 'iban'
              ? formatIBAN(value)
              : key === 'swiftBic'
                ? value.toUpperCase()
                : value
    setFields((current) => ({ ...current, [key]: formatted }))
    if (error) setError('')
  }

  function validate(): string | null {
    if (!selectedType || !effectiveDestination) return 'Choose a receiving method and destination.'
    for (const field of formFields) {
      if (field.required && !String(fields[field.key] ?? '').trim()) {
        return `${field.label} is required.`
      }
    }
    return null
  }

  async function save() {
    const validation = validate()
    if (validation || !selectedType || !effectiveDestination) {
      setError(validation ?? 'Complete the receiving method.')
      return
    }

    const type = selectedType
    const details: Record<string, string> = {
      ...fields,
      countryCode: effectiveDestination.countryCode,
      currency: effectiveDestination.currencyCode,
    }
    if (type === 'stablecoin') {
      details.asset = effectiveDestination.currencyCode
    }
    const label =
      type === 'bank'
        ? fields.bankName
        : type === 'mobile_money'
          ? fields.provider
          : `${effectiveDestination.currencyCode} on ${fields.network}`
    setSubmitting(true)
    setError('')
    try {
      const path = invitationId
        ? `/api/payroll/invitations/${invitationId}/methods`
        : connectionId
          ? `/api/payroll/connections/${connectionId}/methods`
          : null
      if (!path) {
        throw new Error('This payroll connection is no longer open. Close this form and try again.')
      }
      const response = await apiFetch<{ method: Record<string, unknown> }>(path, {
        method: 'POST',
        body: {
          type,
          label,
          details,
          ...(connectionId ? { preferred: true } : {}),
        },
      })
      await onSaved(resultFromApi(response.method, Boolean(connectionId)))
      onClose()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save receiving method')
    } finally {
      setSubmitting(false)
    }
  }

  const close = () => {
    if (!submitting) onClose()
  }

  return (
    <WebAwareModal
      visible={visible}
      onRequestClose={close}
      keyboardAvoiding
      compact={!selectedType}
      nativePanelStyle={selectedType ? styles.formPanel : styles.typePanel}
      webPanelStyle={selectedType ? styles.webFormPanel : undefined}
    >
      <RecipientFormDropdownHost>
        <View style={styles.header}>
          <View style={styles.headerText}>
            <Text style={styles.title}>
              {showWalletScanner
                ? 'Scan wallet address'
                : selectedType
                  ? reviewing
                    ? 'Review receiving method'
                    : `${editingMethod ? 'Edit' : 'Add'} ${methodTitle(selectedType).toLowerCase()}`
                  : 'Add a receiving method'}
            </Text>
            <Text style={styles.subtitle}>
              {reviewing
                ? 'Confirm where you want to receive payroll.'
                : selectedType && editingMethod
                  ? 'Enter the updated receiving details. Your current method stays active until you save.'
                  : selectedType
                    ? 'Enter the receiving details used for payroll payments.'
                    : 'Choose where you want to receive payroll.'}
            </Text>
          </View>
          <Pressable
            onPress={() => {
              if (showWalletScanner) {
                setShowWalletScanner(false)
                return
              }
              close()
            }}
            disabled={submitting}
            style={styles.closeButton}
            accessibilityRole="button"
            accessibilityLabel="Close"
          >
            <X size={22} color={colors.text.secondary} />
          </Pressable>
        </View>

        {!selectedType ? (
          <View style={styles.typeOptions}>
            {TYPE_OPTIONS.map((option) => {
              const Icon = option.icon
              return (
                <Pressable
                  key={option.type}
                  style={styles.typeOption}
                  onPress={() => chooseType(option.type)}
                  accessibilityRole="button"
                >
                  <View style={styles.typeIcon}>
                    <Icon size={22} color={colors.primary.main} />
                  </View>
                  <View style={styles.grow}>
                    <Text style={styles.optionTitle}>{option.title}</Text>
                    <Text style={styles.optionSubtitle}>{option.description}</Text>
                  </View>
                </Pressable>
              )
            })}
          </View>
        ) : (
          <>
            <ScrollView
              style={styles.formScroll}
              contentContainerStyle={styles.formContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {loadingExisting ? (
                <View style={styles.loadingExisting}>
                  <Text style={styles.muted}>Loading saved receiving details…</Text>
                </View>
              ) : reviewing && effectiveDestination ? (
                <View style={styles.reviewCard}>
                  <Text style={styles.reviewTitle}>{methodTitle(selectedType)}</Text>
                  <View style={styles.reviewRow}>
                    <Text style={styles.reviewLabel}>Destination</Text>
                    <Text style={styles.reviewValue}>
                      {selectedType === 'stablecoin'
                        ? effectiveDestination.currencyCode
                        : `${effectiveDestination.countryName} · ${effectiveDestination.currencyCode}`}
                    </Text>
                  </View>
                  {formFields.map((field) => {
                    const value = String(fields[field.key] ?? '').trim()
                    if (!value) return null
                    const sensitive = ['accountNumber', 'phoneNumber', 'walletAddress', 'iban'].includes(field.key)
                    const shown = sensitive && value.length > 4 ? `••••${value.slice(-4)}` : value
                    return (
                      <View key={field.key} style={styles.reviewRow}>
                        <Text style={styles.reviewLabel}>{field.label}</Text>
                        <Text style={styles.reviewValue} numberOfLines={1}>
                          {shown}
                        </Text>
                      </View>
                    )
                  })}
                  {editingMethod ? (
                    <Text style={styles.replaceNote}>
                      Your current method remains active until these changes are saved successfully.
                    </Text>
                  ) : null}
                </View>
              ) : showWalletScanner && selectedType === 'stablecoin' ? (
                <EmbeddedWalletAddressQrScanner
                  visible
                  showHeader={false}
                  onClose={() => setShowWalletScanner(false)}
                  onScan={(address) => {
                    updateField('walletAddress', address)
                    setShowWalletScanner(false)
                  }}
                />
              ) : (
                <>
                  <View style={[styles.selectorWrapper, destinationOpen && styles.selectorWrapperActive]}>
                    <Pressable
                      style={styles.selector}
                      onPress={() => {
                        setDestinationOpen((open) => !open)
                        setProviderOpen(false)
                        setBankOpen(false)
                      }}
                      accessibilityRole="button"
                    >
                      <View style={styles.selectorContent}>
                        {effectiveDestination ? (
                          selectedType === 'stablecoin' && getTokenIconUrl(effectiveDestination.currencyCode) ? (
                            <CachedImage
                              uri={getTokenIconUrl(effectiveDestination.currencyCode)!}
                              style={styles.optionIcon}
                              contentFit="cover"
                            />
                          ) : (
                            <CountryFlag code={effectiveDestination.countryCode} size={22} />
                          )
                        ) : null}
                        <Text style={styles.selectorText}>
                          {effectiveDestination
                            ? selectedType === 'stablecoin'
                              ? effectiveDestination.currencyCode
                              : `${effectiveDestination.currencyCode} - ${effectiveDestination.countryName}`
                            : selectedType === 'stablecoin'
                              ? 'Select asset'
                              : 'Select currency'}
                        </Text>
                        {destinationOpen ? (
                          <ChevronUp size={16} color={colors.brand.slate} />
                        ) : (
                          <ChevronDown size={16} color={colors.brand.slate} />
                        )}
                      </View>
                    </Pressable>
                    <RegisterRecipientDropdownSheet
                      visible={destinationOpen}
                      onClose={() => {
                        setDestinationOpen(false)
                        setDestinationSearch('')
                      }}
                    >
                      <View style={styles.dropdownSearch}>
                        <Search size={18} color={colors.neutral[400]} />
                        <TextInput
                          style={styles.dropdownSearchInput}
                          value={destinationSearch}
                          onChangeText={setDestinationSearch}
                          placeholder={selectedType === 'stablecoin' ? 'Search asset…' : 'Search currencies…'}
                          placeholderTextColor={colors.neutral[400]}
                          autoCorrect={false}
                        />
                      </View>
                      <RecipientFormDropdownList>
                        {visibleDestinations.map((destination) => {
                          const selected =
                            destination.countryCode === effectiveDestination?.countryCode &&
                            destination.currencyCode === effectiveDestination?.currencyCode
                          return (
                            <Pressable
                              key={`${destination.countryCode}-${destination.currencyCode}`}
                              style={[styles.dropdownItem, selected && styles.dropdownItemSelected]}
                              onPress={() => chooseDestination(destination)}
                            >
                              {selectedType === 'stablecoin' && getTokenIconUrl(destination.currencyCode) ? (
                                <CachedImage
                                  uri={getTokenIconUrl(destination.currencyCode)!}
                                  style={styles.optionIcon}
                                  contentFit="cover"
                                />
                              ) : (
                                <CountryFlag code={destination.countryCode} size={22} />
                              )}
                              <View style={styles.grow}>
                                <Text style={styles.optionTitle}>
                                  {selectedType === 'stablecoin' ? destination.currencyCode : destination.currencyCode}
                                </Text>
                                <Text style={styles.optionSubtitle}>
                                  {selectedType === 'stablecoin' ? destination.currencyName : destination.countryName}
                                </Text>
                              </View>
                              {selected ? <Check size={18} color={colors.primary.main} /> : null}
                            </Pressable>
                          )
                        })}
                      </RecipientFormDropdownList>
                    </RegisterRecipientDropdownSheet>
                  </View>

                  {effectiveDestination ? (
                    formFields.map((field) => {
                      if (field.key === 'bankName') {
                        return (
                          <RecipientBankNameField
                            key={field.key}
                            banks={bankOptions}
                            value={fields.bankName ?? ''}
                            onChange={(value) => updateField('bankName', value)}
                            placeholder={field.placeholder}
                            disabled={submitting}
                            showDropdown={bankOpen}
                            onToggleDropdown={() => {
                              setBankOpen((open) => !open)
                              setDestinationOpen(false)
                              setProviderOpen(false)
                            }}
                            searchTerm={bankSearch}
                            onSearchTermChange={setBankSearch}
                            onCloseDropdown={() => setBankOpen(false)}
                          />
                        )
                      }

                      if (field.key === 'provider' || field.key === 'network') {
                        const isNetwork = field.key === 'network'
                        return (
                          <View
                            key={field.key}
                            style={[styles.selectorWrapper, providerOpen && styles.selectorWrapperActive]}
                          >
                            <Pressable
                              style={styles.selector}
                              onPress={() => {
                                setProviderOpen((open) => !open)
                                setDestinationOpen(false)
                                setBankOpen(false)
                              }}
                              disabled={submitting}
                            >
                              <View style={styles.selectorContent}>
                                {fields[field.key] ? (
                                  isNetwork ? (
                                    getNetworkIconUrl(fields[field.key]) ? (
                                      <CachedImage
                                        uri={getNetworkIconUrl(fields[field.key])!}
                                        style={styles.optionIcon}
                                        contentFit="cover"
                                      />
                                    ) : null
                                  ) : (
                                    <MobileMoneyProviderIcon provider={fields[field.key]} size={22} />
                                  )
                                ) : null}
                                <Text style={styles.selectorText}>{fields[field.key] || field.placeholder}</Text>
                                {providerOpen ? (
                                  <ChevronUp size={16} color={colors.brand.slate} />
                                ) : (
                                  <ChevronDown size={16} color={colors.brand.slate} />
                                )}
                              </View>
                            </Pressable>
                            <RegisterRecipientDropdownSheet
                              visible={providerOpen}
                              onClose={() => {
                                setProviderOpen(false)
                                setProviderSearch('')
                              }}
                            >
                              <View style={styles.dropdownSearch}>
                                <Search size={18} color={colors.neutral[400]} />
                                <TextInput
                                  style={styles.dropdownSearchInput}
                                  value={providerSearch}
                                  onChangeText={setProviderSearch}
                                  placeholder={isNetwork ? 'Search networks…' : 'Search providers…'}
                                  placeholderTextColor={colors.neutral[400]}
                                  autoCorrect={false}
                                />
                              </View>
                              <RecipientFormDropdownList>
                                {filteredProviderOptions.map((option) => (
                                  <Pressable
                                    key={option}
                                    style={[
                                      styles.dropdownItem,
                                      fields[field.key] === option && styles.dropdownItemSelected,
                                    ]}
                                    onPress={() => {
                                      updateField(field.key, option)
                                      setProviderOpen(false)
                                      setProviderSearch('')
                                    }}
                                  >
                                    {isNetwork ? (
                                      getNetworkIconUrl(option) ? (
                                        <CachedImage
                                          uri={getNetworkIconUrl(option)!}
                                          style={styles.optionIcon}
                                          contentFit="cover"
                                        />
                                      ) : null
                                    ) : (
                                      <MobileMoneyProviderIcon provider={option} size={22} />
                                    )}
                                    <Text style={styles.dropdownItemText}>{option}</Text>
                                    {fields[field.key] === option ? (
                                      <Check size={18} color={colors.primary.main} />
                                    ) : null}
                                  </Pressable>
                                ))}
                              </RecipientFormDropdownList>
                            </RegisterRecipientDropdownSheet>
                          </View>
                        )
                      }

                      if (field.key === 'walletAddress') {
                        return (
                          <WalletAddressField
                            key={field.key}
                            value={fields.walletAddress ?? ''}
                            onChangeText={(value) => updateField('walletAddress', value)}
                            onScanPress={() => setShowWalletScanner(true)}
                            editable={!submitting}
                          />
                        )
                      }

                      return (
                        <TextInput
                          key={field.key}
                          style={styles.formInput}
                          value={fields[field.key] ?? ''}
                          onChangeText={(value) => updateField(field.key, value)}
                          placeholder={`${field.placeholder}${field.required ? ' *' : ''}`}
                          placeholderTextColor={colors.text.secondary}
                          keyboardType={field.keyboardType}
                          autoCapitalize={field.key === 'iban' || field.key === 'swiftBic' ? 'characters' : 'words'}
                          autoCorrect={false}
                          editable={!submitting}
                        />
                      )
                    })
                  ) : null}
                </>
              )}

              {destinations.length === 0 ? (
                <Text style={styles.errorText}>
                  Receiving-method options are unavailable. Check your connection and try again.
                </Text>
              ) : null}
              {error ? <Text style={styles.errorText}>{error}</Text> : null}
            </ScrollView>

            {!showWalletScanner ? (
              <View style={styles.footer}>
                <Button
                  title="Back"
                  variant="ghost"
                  onPress={() => {
                    if (reviewing) {
                      setReviewing(false)
                      return
                    }
                    if (editingMethod) {
                      close()
                    } else {
                      setSelectedType(null)
                      setSelectedDestination(null)
                      setFields({})
                      setError('')
                    }
                  }}
                  disabled={submitting}
                />
                <Button
                  title={reviewing ? (editingMethod ? 'Save changes' : 'Save receiving method') : 'Review method'}
                  onPress={() => {
                    if (reviewing) {
                      void save()
                    } else {
                      setError('')
                      setReviewing(true)
                    }
                  }}
                  loading={submitting}
                  disabled={!formComplete}
                  style={styles.saveButton}
                />
              </View>
            ) : null}
          </>
        )}
      </RecipientFormDropdownHost>
    </WebAwareModal>
  )
}

const styles = StyleSheet.create({
  typePanel: { paddingHorizontal: spacing[5], paddingBottom: spacing[6] },
  formPanel: { height: '90%', paddingBottom: spacing[4] },
  webFormPanel: { maxHeight: '90%', maxWidth: 580 },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing[3],
    paddingHorizontal: spacing[5],
    paddingTop: spacing[4],
    paddingBottom: spacing[4],
  },
  headerText: { flex: 1, gap: spacing[1] },
  title: {
    ...textStyles.headingSmall,
    color: colors.text.primary,
    fontFamily: fontFamily.semibold,
  },
  subtitle: { ...textStyles.bodySmall, color: colors.text.secondary },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background.secondary,
  },
  typeOptions: { gap: spacing[2] },
  typeOption: {
    minHeight: 76,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    padding: spacing[4],
    borderWidth: 1,
    borderColor: colors.border.default,
    borderRadius: borderRadius.xl,
  },
  typeIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary.main + '12',
  },
  grow: { flex: 1, minWidth: 0 },
  optionTitle: {
    ...textStyles.titleSmall,
    color: colors.text.primary,
    fontFamily: fontFamily.semibold,
  },
  optionSubtitle: {
    ...textStyles.bodySmall,
    color: colors.text.secondary,
    marginTop: 2,
  },
  formScroll: { flex: 1 },
  formContent: { paddingHorizontal: spacing[5], paddingBottom: spacing[5] },
  loadingExisting: {
    minHeight: 180,
    alignItems: 'center',
    justifyContent: 'center',
  },
  muted: { ...textStyles.bodySmall, color: colors.text.secondary },
  selectorWrapper: {
    marginBottom: spacing[4],
    zIndex: 1000,
  },
  selectorWrapperActive: {
    zIndex: 4000,
  },
  selector: {
    ...surfaceFrameStyle(colors, { shadow: 'none', radius: borderRadius.full }),
    padding: spacing[3],
  },
  selectorContent: {
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  selectorText: {
    flex: 1,
    minWidth: 0,
    ...textStyles.bodyMedium,
    color: colors.text.primary,
    fontFamily: fontFamily.regular,
  },
  optionIcon: {
    width: 22,
    height: 22,
    borderRadius: 11,
  },
  dropdownSearch: {
    ...dropdownSearchRowStyle,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.light,
  },
  dropdownSearchInput: {
    ...dropdownSearchInputStyle,
    color: colors.text.primary,
  },
  dropdownItem: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[3],
  },
  dropdownItemSelected: {
    backgroundColor: colors.primary.main + '12',
  },
  dropdownItemText: {
    flex: 1,
    minWidth: 0,
    ...textStyles.bodyMedium,
    color: colors.text.primary,
    fontFamily: fontFamily.regular,
  },
  formInput: {
    borderWidth: 1.5,
    borderColor: colors.frame.border,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing[4],
    ...compactFormInputStyle,
    color: colors.text.primary,
    marginBottom: spacing[2],
    backgroundColor: colors.frame.background,
  },
  errorText: {
    ...textStyles.bodySmall,
    color: colors.error.main,
    marginBottom: spacing[3],
  },
  reviewCard: {
    gap: spacing[3],
    padding: spacing[4],
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border.default,
    borderRadius: borderRadius.xl,
    backgroundColor: colors.background.primary,
  },
  reviewTitle: {
    ...textStyles.titleMedium,
    color: colors.text.primary,
    fontFamily: fontFamily.semibold,
  },
  reviewRow: {
    minHeight: 36,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing[3],
  },
  reviewLabel: {
    ...textStyles.bodySmall,
    color: colors.text.secondary,
  },
  reviewValue: {
    ...textStyles.bodyMedium,
    color: colors.text.primary,
    fontFamily: fontFamily.medium,
    flex: 1,
    textAlign: 'right',
  },
  replaceNote: {
    ...textStyles.bodySmall,
    color: colors.text.secondary,
    paddingTop: spacing[2],
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border.light,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    paddingHorizontal: spacing[5],
    paddingTop: spacing[3],
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border.light,
  },
  saveButton: { flex: 1 },
})

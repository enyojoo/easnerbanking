import React, { useEffect, useMemo, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { Building2, Check, ChevronDown, Smartphone, Wallet, X } from 'lucide-react-native'
import { WebAwareModal } from '../WebAwareModal'
import { Button, TextField } from '../ui'
import { apiFetch } from '../../query/api-client'
import { useSendDestinations } from '../../hooks/useSendDestinations'
import {
  buildRecipientCatalogForType,
  type RecipientCatalogEntry,
  type RecipientFieldKey,
} from '../../lib/recipientCatalog'
import { borderRadius, colors, fontFamily, spacing, textStyles } from '../../theme'
import { useAuth } from '../../contexts/AuthContext'
import { recipientService } from '../../lib/recipientService'

export type PayrollExternalMethodType = 'bank' | 'mobile_money' | 'stablecoin'

export type PayrollReceivingMethodResult = {
  id: string
  type: PayrollExternalMethodType
  label: string
  maskedDetails: Record<string, string>
  preferred: boolean
}

type ExistingMethod = {
  id: string
  type: PayrollExternalMethodType
  label: string
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

function resultFromApi(
  value: Record<string, unknown>,
  preferred: boolean,
): PayrollReceivingMethodResult {
  return {
    id: String(value.id),
    type: String(value.type) as PayrollExternalMethodType,
    label: String(value.label || methodTitle(String(value.type) as PayrollExternalMethodType)),
    maskedDetails: (
      value.maskedDetails
      ?? value.masked_details
      ?? {}
    ) as Record<string, string>,
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
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const catalogType = selectedType === 'stablecoin'
    ? 'wallet'
    : selectedType
  const destinations = useMemo(
    () => catalogType
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
      `${item.countryName} ${item.countryCode} ${item.currencyName} ${item.currencyCode}`
        .toLowerCase()
        .includes(query),
    )
  }, [destinationSearch, destinations])

  useEffect(() => {
    if (!visible) return
    const type = editingMethod?.type ?? null
    setSelectedType(type)
    setSelectedDestination(null)
    setFields({})
    setDestinationOpen(false)
    setDestinationSearch('')
    setSubmitting(false)
    setError('')
  }, [editingMethod, visible])

  useEffect(() => {
    if (!selectedType || destinations.length === 0 || selectedDestination) return
    setSelectedDestination(destinations[0])
  }, [destinations, selectedDestination, selectedType])

  const formFields = selectedDestination?.fields ?? []
  const providerField = selectedType === 'mobile_money'
    ? 'provider'
    : selectedType === 'stablecoin'
      ? 'network'
      : 'bankName'
  const providerOptions = selectedDestination?.providers ?? []

  function chooseType(type: PayrollExternalMethodType) {
    setSelectedType(type)
    setSelectedDestination(null)
    setFields({})
    setError('')
  }

  function chooseDestination(destination: RecipientCatalogEntry) {
    setSelectedDestination(destination)
    setFields({})
    setDestinationOpen(false)
    setDestinationSearch('')
    setError('')
  }

  function updateField(key: RecipientFieldKey | string, value: string) {
    setFields((current) => ({ ...current, [key]: value }))
    if (error) setError('')
  }

  function validate(): string | null {
    if (!selectedType || !selectedDestination) return 'Choose a receiving method and destination.'
    for (const field of formFields) {
      if (field.required && !String(fields[field.key] ?? '').trim()) {
        return `${field.label} is required.`
      }
    }
    return null
  }

  async function save() {
    const validation = validate()
    if (validation || !selectedType || !selectedDestination) {
      setError(validation ?? 'Complete the receiving method.')
      return
    }

    const type = selectedType
    const details: Record<string, string> = {
      ...fields,
      countryCode: selectedDestination.countryCode,
      currency: selectedDestination.currencyCode,
    }
    if (type === 'stablecoin') {
      details.asset = selectedDestination.currencyCode
    }
    const label = type === 'bank'
      ? fields.bankName
      : type === 'mobile_money'
        ? fields.provider
        : `${selectedDestination.currencyCode} on ${fields.network}`
    setSubmitting(true)
    setError('')
    try {
      if (!userProfile?.id) throw new Error('Your account could not be verified. Please sign in again.')
      const recipient = await recipientService.create(userProfile.id, {
        fullName: fields.fullName,
        accountNumber:
          type === 'bank'
            ? fields.accountNumber
            : type === 'mobile_money'
              ? fields.phoneNumber
              : fields.walletAddress,
        bankName:
          type === 'bank'
            ? fields.bankName
            : type === 'mobile_money'
              ? `Mobile Money (${fields.provider})`
              : `Wallet (${selectedDestination.currencyCode}/${fields.network})`,
        currency: selectedDestination.currencyCode,
        countryCode: selectedDestination.countryCode,
        phoneNumber: type === 'mobile_money' ? fields.phoneNumber : undefined,
        mobileProvider: type === 'mobile_money' ? fields.provider : undefined,
        walletNetwork: type === 'stablecoin' ? fields.network : undefined,
        routingNumber: fields.routingNumber || undefined,
        sortCode: fields.sortCode || undefined,
        iban: fields.iban || undefined,
        swiftBic: fields.swiftBic || undefined,
        addressLine1: fields.addressLine1 || undefined,
        city: fields.city || undefined,
        state: fields.state || undefined,
        postalCode: fields.postalCode || undefined,
      })
      const path = invitationId
        ? `/api/payroll/invitations/${invitationId}/methods`
        : `/api/payroll/connections/${connectionId}/methods`
      const response = await apiFetch<{ method: Record<string, unknown> }>(path, {
        method: 'POST',
        body: {
          type,
          label,
          details,
          providerRecipientId: recipient.id,
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
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={styles.title}>
            {selectedType
              ? `${editingMethod ? 'Update' : 'Add'} ${methodTitle(selectedType).toLowerCase()}`
              : 'Add a receiving method'}
          </Text>
          <Text style={styles.subtitle}>
            {selectedType && editingMethod
              ? 'Re-enter the details to securely replace this receiving method.'
              : selectedType
                ? 'These details are used only for payroll payments.'
                : 'Choose where you want to receive payroll.'}
          </Text>
        </View>
        <Pressable
          onPress={close}
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
            <Pressable
              style={styles.destinationButton}
              onPress={() => setDestinationOpen((open) => !open)}
              accessibilityRole="button"
            >
              <View style={styles.grow}>
                <Text style={styles.destinationLabel}>
                  {selectedType === 'stablecoin' ? 'Asset' : 'Country and currency'}
                </Text>
                <Text style={styles.destinationValue}>
                  {selectedDestination
                    ? selectedType === 'stablecoin'
                      ? `${selectedDestination.currencyCode} · ${selectedDestination.currencyName}`
                      : `${selectedDestination.countryName} · ${selectedDestination.currencyCode}`
                    : 'Select'}
                </Text>
              </View>
              <ChevronDown size={18} color={colors.text.secondary} />
            </Pressable>

            {destinationOpen ? (
              <View style={styles.destinationMenu}>
                <TextField
                  label="Search"
                  value={destinationSearch}
                  onChangeText={setDestinationSearch}
                  placeholder="Country or currency"
                  autoCapitalize="none"
                  containerStyle={styles.searchField}
                />
                <ScrollView style={styles.destinationList} nestedScrollEnabled keyboardShouldPersistTaps="handled">
                  {visibleDestinations.map((destination) => {
                    const selected =
                      destination.countryCode === selectedDestination?.countryCode
                      && destination.currencyCode === selectedDestination?.currencyCode
                    return (
                      <Pressable
                        key={`${destination.countryCode}-${destination.currencyCode}`}
                        style={styles.destinationOption}
                        onPress={() => chooseDestination(destination)}
                      >
                        <View style={styles.grow}>
                          <Text style={styles.optionTitle}>
                            {selectedType === 'stablecoin'
                              ? destination.currencyCode
                              : destination.countryName}
                          </Text>
                          <Text style={styles.optionSubtitle}>
                            {selectedType === 'stablecoin'
                              ? destination.currencyName
                              : `${destination.currencyCode} · ${destination.currencyName}`}
                          </Text>
                        </View>
                        {selected ? <Check size={17} color={colors.primary.main} /> : null}
                      </Pressable>
                    )
                  })}
                </ScrollView>
              </View>
            ) : null}

            {formFields.map((field) => {
              const options = field.key === providerField ? providerOptions : []
              return (
                <View key={field.key}>
                  <TextField
                    label={field.label}
                    value={fields[field.key] ?? ''}
                    onChangeText={(value) => updateField(field.key, value)}
                    placeholder={field.placeholder}
                    keyboardType={field.keyboardType}
                    autoCapitalize={
                      field.key === 'walletAddress' || field.key === 'iban' || field.key === 'swiftBic'
                        ? 'characters'
                        : 'words'
                    }
                  />
                  {options.length > 0 ? (
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={styles.optionChips}
                    >
                      {options.map((option) => {
                        const selected = fields[field.key] === option
                        return (
                          <Pressable
                            key={option}
                            style={[styles.optionChip, selected && styles.optionChipSelected]}
                            onPress={() => updateField(field.key, option)}
                          >
                            <Text style={[styles.optionChipText, selected && styles.optionChipTextSelected]}>
                              {option}
                            </Text>
                          </Pressable>
                        )
                      })}
                    </ScrollView>
                  ) : null}
                </View>
              )
            })}

            {destinations.length === 0 ? (
              <Text style={styles.errorText}>
                Receiving-method options are unavailable. Check your connection and try again.
              </Text>
            ) : null}
            {error ? <Text style={styles.errorText}>{error}</Text> : null}
          </ScrollView>

          <View style={styles.footer}>
            {!editingMethod ? (
              <Button
                title="Back"
                variant="ghost"
                onPress={() => {
                  setSelectedType(null)
                  setSelectedDestination(null)
                  setFields({})
                  setError('')
                }}
                disabled={submitting}
              />
            ) : null}
            <Button
              title={editingMethod ? 'Update method' : 'Add method'}
              onPress={() => void save()}
              loading={submitting}
              disabled={!selectedDestination}
              style={styles.saveButton}
            />
          </View>
        </>
      )}
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
  title: { ...textStyles.headingSmall, color: colors.text.primary, fontFamily: fontFamily.semibold },
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
  optionTitle: { ...textStyles.titleSmall, color: colors.text.primary, fontFamily: fontFamily.semibold },
  optionSubtitle: { ...textStyles.bodySmall, color: colors.text.secondary, marginTop: 2 },
  formScroll: { flex: 1 },
  formContent: { paddingHorizontal: spacing[5], paddingBottom: spacing[5] },
  destinationButton: {
    minHeight: 62,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    paddingHorizontal: spacing[4],
    marginBottom: spacing[4],
    borderWidth: 1,
    borderColor: colors.border.default,
    borderRadius: borderRadius.lg,
  },
  destinationLabel: { ...textStyles.labelSmall, color: colors.text.secondary },
  destinationValue: { ...textStyles.bodyMedium, color: colors.text.primary, marginTop: 2 },
  destinationMenu: {
    marginTop: -spacing[2],
    marginBottom: spacing[4],
    padding: spacing[3],
    borderWidth: 1,
    borderColor: colors.border.default,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.background.primary,
  },
  searchField: { marginBottom: spacing[2] },
  destinationList: { maxHeight: 220 },
  destinationOption: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    paddingHorizontal: spacing[2],
    paddingVertical: spacing[2],
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border.light,
  },
  optionChips: { gap: spacing[2], paddingBottom: spacing[4] },
  optionChip: {
    minHeight: 36,
    justifyContent: 'center',
    paddingHorizontal: spacing[3],
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: colors.border.default,
    backgroundColor: colors.background.primary,
  },
  optionChipSelected: {
    borderColor: colors.primary.main,
    backgroundColor: colors.primary.main + '10',
  },
  optionChipText: { ...textStyles.bodySmall, color: colors.text.secondary },
  optionChipTextSelected: { color: colors.primary.main, fontFamily: fontFamily.semibold },
  errorText: { ...textStyles.bodySmall, color: colors.error.main, marginBottom: spacing[3] },
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

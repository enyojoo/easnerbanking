import React from 'react'
import { View, Text, TextInput, Pressable } from 'react-native'
import { Check, ChevronDown, ChevronUp, Search } from 'lucide-react-native'
import { CountryFlag } from '../flags/CountryFlag'
import { CurrencyFlag } from '../flags/CurrencyFlag'
import { RegisterRecipientDropdownSheet } from './RecipientFormDropdownHost'
import RecipientFormDropdownList from './RecipientFormDropdownList'
import { recipientFormStyles as styles } from './recipientFormStyles'
import { colors } from '../../theme'
import { ripple } from '../../lib/androidRipple'
import { haptics } from '../../lib/haptics'
import type { UseRecipientFormStateReturn } from '../../hooks/useRecipientFormState'
import { getRecipientProviders } from '../../lib/recipientCatalog'

type FormSlice = Pick<
  UseRecipientFormStateReturn,
  | 'newRecipient'
  | 'setNewRecipient'
  | 'selectedRecipientType'
  | 'selectedCountryCurrency'
  | 'setSelectedCountryCurrency'
  | 'setTransferType'
  | 'showCurrencyDropdown'
  | 'setShowCurrencyDropdown'
  | 'currencySearchTerm'
  | 'setCurrencySearchTerm'
  | 'filteredCurrencies'
  | 'selectedCatalogEntry'
  | 'isSubmitting'
  | 'setShowSubdivisionDropdown'
  | 'setShowBankDropdown'
  | 'setShowProviderDropdown'
  | 'setShowWalletAssetDropdown'
  | 'setShowWalletNetworkDropdown'
>

export function CountryCurrencySelector({ form }: { form: FormSlice }) {
  if (form.selectedRecipientType === 'wallet' || form.selectedRecipientType === 'easenet') {
    return null
  }

  return (
    <View
      style={[
        styles.currencySelectorWrapper,
        form.showCurrencyDropdown && styles.currencySelectorWrapperActive,
      ]}
    >
      <Pressable
        android_ripple={ripple.neutral}
        style={styles.currencySelector}
        onPress={() => {
          form.setShowCurrencyDropdown(!form.showCurrencyDropdown)
          form.setCurrencySearchTerm('')
          form.setShowSubdivisionDropdown(false)
          form.setShowBankDropdown(false)
        }}
      >
        <View style={styles.currencySelectorContent}>
          {form.selectedCatalogEntry ? (
            <CountryFlag code={form.selectedCatalogEntry.countryCode} size={22} style={styles.currencyFlag} />
          ) : (
            <CurrencyFlag currency={form.newRecipient.currency} size={22} style={styles.currencyFlag} />
          )}
          <Text style={styles.currencySelectorText}>
            {form.selectedCatalogEntry
              ? `${form.newRecipient.currency} - ${form.selectedCatalogEntry.countryName}`
              : 'Select currency'}
          </Text>
          {form.showCurrencyDropdown ? (
            <ChevronUp size={16} color={colors.brand.slate} strokeWidth={2} />
          ) : (
            <ChevronDown size={16} color={colors.brand.slate} strokeWidth={2} />
          )}
        </View>
      </Pressable>

      <RegisterRecipientDropdownSheet
        visible={form.showCurrencyDropdown}
        onClose={() => {
          form.setShowCurrencyDropdown(false)
          form.setCurrencySearchTerm('')
        }}
      >
        <View style={styles.currencyDropdownSearch}>
          <Search size={18} color={colors.neutral[400]} strokeWidth={2} />
          <TextInput
            style={styles.currencyDropdownSearchInput}
            placeholder="Search currencies..."
            placeholderTextColor={colors.neutral[400]}
            value={form.currencySearchTerm}
            onChangeText={form.setCurrencySearchTerm}
          />
        </View>
        <RecipientFormDropdownList>
          {form.filteredCurrencies.map((item) => {
            const isSelected =
              form.newRecipient.currency === item.currencyCode &&
              form.selectedCountryCurrency?.countryCode === item.countryCode
            return (
              <Pressable
                key={`${item.countryCode}-${item.currencyCode}`}
                android_ripple={ripple.neutral}
                style={[styles.currencyDropdownItem, isSelected && styles.currencyDropdownItemSelected]}
                onPress={() => {
                  haptics.tap()
                  form.setSelectedCountryCurrency({
                    countryCode: item.countryCode,
                    countryName: item.countryName,
                    currencyCode: item.currencyCode,
                    currencyName: item.currencyName,
                    flagEmoji: '',
                  })
                  form.setTransferType(null)
                  const firstProvider =
                    getRecipientProviders(item.currencyCode, 'mobile_money', item.countryCode)[0] || ''
                  form.setNewRecipient((prev) => ({
                    ...prev,
                    currency: item.currencyCode,
                    provider: form.selectedRecipientType === 'mobile' ? firstProvider : prev.provider,
                  }))
                  form.setShowCurrencyDropdown(false)
                  form.setCurrencySearchTerm('')
                }}
              >
                <CountryFlag code={item.countryCode} size={22} style={styles.currencyFlag} />
                <View style={styles.currencyInfo}>
                  <Text style={styles.currencyCode}>{item.currencyCode}</Text>
                  <Text style={styles.currencyName}>{item.countryName}</Text>
                </View>
                {isSelected ? <Check size={18} color={colors.primary.main} strokeWidth={2.5} /> : null}
              </Pressable>
            )
          })}
        </RecipientFormDropdownList>
      </RegisterRecipientDropdownSheet>
    </View>
  )
}

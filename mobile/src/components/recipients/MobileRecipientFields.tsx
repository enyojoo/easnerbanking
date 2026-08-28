import React from 'react'
import { View, Text, TextInput, Pressable } from 'react-native'
import { Check, ChevronDown, ChevronUp, Search } from 'lucide-react-native'
import { MobileMoneyProviderIcon } from '@easner/shared'
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
  | 'selectedCountryCurrency'
  | 'showProviderDropdown'
  | 'setShowProviderDropdown'
  | 'providerSearchTerm'
  | 'setProviderSearchTerm'
  | 'isSubmitting'
  | 'setShowCurrencyDropdown'
  | 'setShowWalletAssetDropdown'
  | 'setShowWalletNetworkDropdown'
>

export function MobileRecipientFields({ form }: { form: FormSlice }) {
  return (
    <>
      <View
        style={[
          styles.currencySelectorWrapper,
          form.showProviderDropdown && styles.currencySelectorWrapperActive,
        ]}
      >
        <Pressable
          android_ripple={ripple.neutral}
          style={styles.currencySelector}
          onPress={() => {
            form.setShowProviderDropdown(!form.showProviderDropdown)
            form.setShowCurrencyDropdown(false)
            form.setShowWalletAssetDropdown(false)
            form.setShowWalletNetworkDropdown(false)
          }}
          disabled={form.isSubmitting}
        >
          <View style={styles.currencySelectorContent}>
            {form.newRecipient.provider ? (
              <>
                <MobileMoneyProviderIcon provider={form.newRecipient.provider} size={22} />
                <Text style={styles.currencySelectorText}>{form.newRecipient.provider}</Text>
              </>
            ) : (
              <Text style={styles.currencySelectorText}>Select provider</Text>
            )}
            {form.showProviderDropdown ? (
              <ChevronUp size={16} color={colors.brand.slate} strokeWidth={2} />
            ) : (
              <ChevronDown size={16} color={colors.brand.slate} strokeWidth={2} />
            )}
          </View>
        </Pressable>
        <RegisterRecipientDropdownSheet
          visible={form.showProviderDropdown}
          onClose={() => {
            form.setShowProviderDropdown(false)
            form.setProviderSearchTerm('')
          }}
        >
          <View style={styles.currencyDropdownSearch}>
            <Search size={18} color={colors.neutral[400]} strokeWidth={2} />
            <TextInput
              style={styles.currencyDropdownSearchInput}
              placeholder="Search providers..."
              placeholderTextColor={colors.neutral[400]}
              value={form.providerSearchTerm}
              onChangeText={form.setProviderSearchTerm}
            />
          </View>
          <RecipientFormDropdownList>
            {getRecipientProviders(
              form.newRecipient.currency,
              'mobile_money',
              form.selectedCountryCurrency?.countryCode,
            )
              .filter((provider) =>
                provider.toLowerCase().includes(form.providerSearchTerm.toLowerCase()),
              )
              .map((provider) => (
                <Pressable
                  key={provider}
                  android_ripple={ripple.neutral}
                  style={[
                    styles.currencyDropdownItem,
                    form.newRecipient.provider === provider && styles.currencyDropdownItemSelected,
                  ]}
                  onPress={() => {
                    haptics.tap()
                    form.setNewRecipient((prev) => ({ ...prev, provider }))
                    form.setShowProviderDropdown(false)
                    form.setProviderSearchTerm('')
                  }}
                >
                  <MobileMoneyProviderIcon provider={provider} size={22} />
                  <View style={styles.currencyInfo}>
                    <Text style={styles.currencyCode}>{provider}</Text>
                  </View>
                  {form.newRecipient.provider === provider ? (
                    <Check size={18} color={colors.primary.main} strokeWidth={2.5} />
                  ) : null}
                </Pressable>
              ))}
          </RecipientFormDropdownList>
        </RegisterRecipientDropdownSheet>
      </View>
      <TextInput
        style={styles.modalInput}
        value={form.newRecipient.fullName}
        onChangeText={(text) => form.setNewRecipient((prev) => ({ ...prev, fullName: text }))}
        placeholder="Account name"
        placeholderTextColor={colors.text.secondary}
        editable={!form.isSubmitting}
      />
      <TextInput
        style={styles.modalInput}
        value={form.newRecipient.phoneNumber}
        onChangeText={(text) => form.setNewRecipient((prev) => ({ ...prev, phoneNumber: text }))}
        placeholder="Phone number"
        placeholderTextColor={colors.text.secondary}
        keyboardType="phone-pad"
        editable={!form.isSubmitting}
      />
    </>
  )
}

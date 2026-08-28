import React from 'react'
import { View, Text, TextInput, Pressable } from 'react-native'
import { Check, ChevronDown, ChevronUp, Search } from 'lucide-react-native'
import { CachedImage } from '../CachedImage'
import { WalletAddressField } from './WalletAddressField'
import { RegisterRecipientDropdownSheet } from './RecipientFormDropdownHost'
import RecipientFormDropdownList from './RecipientFormDropdownList'
import { recipientFormStyles as styles } from './recipientFormStyles'
import { colors } from '../../theme'
import { ripple } from '../../lib/androidRipple'
import { haptics } from '../../lib/haptics'
import type { UseRecipientFormStateReturn } from '../../hooks/useRecipientFormState'
import { getWalletNetworksForAsset } from '../../lib/recipientCatalog'
import { getNetworkIconUrl, getTokenIconUrl } from '../../lib/cryptoIcons'

type FormSlice = Pick<
  UseRecipientFormStateReturn,
  | 'newRecipient'
  | 'setNewRecipient'
  | 'isSubmitting'
  | 'applyWalletAddressInference'
  | 'handleWalletScanPress'
  | 'showWalletAssetDropdown'
  | 'setShowWalletAssetDropdown'
  | 'showWalletNetworkDropdown'
  | 'setShowWalletNetworkDropdown'
  | 'walletAssetSearchTerm'
  | 'setWalletAssetSearchTerm'
  | 'walletNetworkSearchTerm'
  | 'setWalletNetworkSearchTerm'
  | 'filteredWalletAssets'
  | 'filteredWalletNetworks'
>

export function WalletRecipientFields({ form }: { form: FormSlice }) {
  return (
    <>
      <View style={styles.walletAddressInputWrap}>
        <TextInput
          style={[styles.modalInput, styles.walletAddressInput, styles.walletNicknameInput]}
          value={form.newRecipient.fullName}
          onChangeText={(text) => form.setNewRecipient((prev) => ({ ...prev, fullName: text }))}
          placeholder="Address nickname"
          placeholderTextColor={colors.text.secondary}
          editable={!form.isSubmitting}
        />
      </View>
      <WalletAddressField
        value={form.newRecipient.walletAddress}
        onChangeText={(text) => {
          form.setNewRecipient((prev) => ({ ...prev, walletAddress: text }))
          form.applyWalletAddressInference(text)
        }}
        onScanPress={form.handleWalletScanPress}
        editable={!form.isSubmitting}
      />
      <View
        style={[
          styles.currencySelectorWrapper,
          form.showWalletAssetDropdown && styles.currencySelectorWrapperActive,
        ]}
      >
        <Pressable
          android_ripple={ripple.neutral}
          style={styles.currencySelector}
          onPress={() => {
            form.setShowWalletAssetDropdown(!form.showWalletAssetDropdown)
            form.setShowWalletNetworkDropdown(false)
          }}
          disabled={form.isSubmitting}
        >
          <View style={styles.currencySelectorContent}>
            {getTokenIconUrl(form.newRecipient.currency) ? (
              <CachedImage
                uri={getTokenIconUrl(form.newRecipient.currency)!}
                style={styles.cryptoIcon}
                contentFit="cover"
              />
            ) : null}
            <Text style={styles.currencySelectorText}>
              {form.newRecipient.currency || 'Select asset'}
            </Text>
            {form.showWalletAssetDropdown ? (
              <ChevronUp size={16} color={colors.brand.slate} strokeWidth={2} />
            ) : (
              <ChevronDown size={16} color={colors.brand.slate} strokeWidth={2} />
            )}
          </View>
        </Pressable>
        <RegisterRecipientDropdownSheet
          visible={form.showWalletAssetDropdown}
          onClose={() => {
            form.setShowWalletAssetDropdown(false)
            form.setWalletAssetSearchTerm('')
          }}
        >
          <View style={styles.currencyDropdownSearch}>
            <Search size={18} color={colors.neutral[400]} strokeWidth={2} />
            <TextInput
              style={styles.currencyDropdownSearchInput}
              placeholder="Search asset..."
              placeholderTextColor={colors.neutral[400]}
              value={form.walletAssetSearchTerm}
              onChangeText={form.setWalletAssetSearchTerm}
            />
          </View>
          <RecipientFormDropdownList>
            {form.filteredWalletAssets.map((asset) => (
              <Pressable
                key={asset}
                android_ripple={ripple.neutral}
                style={[
                  styles.currencyDropdownItem,
                  form.newRecipient.currency === asset && styles.currencyDropdownItemSelected,
                ]}
                onPress={() => {
                  haptics.tap()
                  const networks = getWalletNetworksForAsset(asset)
                  form.setNewRecipient((prev) => ({
                    ...prev,
                    currency: asset,
                    network: networks[0] || '',
                  }))
                  form.setShowWalletAssetDropdown(false)
                  form.setWalletAssetSearchTerm('')
                }}
              >
                {getTokenIconUrl(asset) ? (
                  <CachedImage uri={getTokenIconUrl(asset)!} style={styles.cryptoIcon} contentFit="cover" />
                ) : null}
                <View style={styles.currencyInfo}>
                  <Text style={styles.currencyCode}>{asset}</Text>
                </View>
                {form.newRecipient.currency === asset ? (
                  <Check size={18} color={colors.primary.main} strokeWidth={2.5} />
                ) : null}
              </Pressable>
            ))}
          </RecipientFormDropdownList>
        </RegisterRecipientDropdownSheet>
      </View>
      <View
        style={[
          styles.currencySelectorWrapper,
          form.showWalletNetworkDropdown && styles.currencySelectorWrapperActive,
        ]}
      >
        <Pressable
          android_ripple={ripple.neutral}
          style={styles.currencySelector}
          onPress={() => {
            if (!form.isSubmitting) {
              form.setShowWalletNetworkDropdown(!form.showWalletNetworkDropdown)
              form.setShowWalletAssetDropdown(false)
            }
          }}
          disabled={form.isSubmitting}
        >
          <View style={styles.currencySelectorContent}>
            {getNetworkIconUrl(form.newRecipient.network) ? (
              <CachedImage
                uri={getNetworkIconUrl(form.newRecipient.network)!}
                style={styles.cryptoIcon}
                contentFit="cover"
              />
            ) : null}
            <Text style={styles.currencySelectorText}>
              {form.newRecipient.network || 'Select network'}
            </Text>
            {form.showWalletNetworkDropdown ? (
              <ChevronUp size={16} color={colors.brand.slate} strokeWidth={2} />
            ) : (
              <ChevronDown size={16} color={colors.brand.slate} strokeWidth={2} />
            )}
          </View>
        </Pressable>
        <RegisterRecipientDropdownSheet
          visible={form.showWalletNetworkDropdown}
          onClose={() => {
            form.setShowWalletNetworkDropdown(false)
            form.setWalletNetworkSearchTerm('')
          }}
        >
          <View style={styles.currencyDropdownSearch}>
            <Search size={18} color={colors.neutral[400]} strokeWidth={2} />
            <TextInput
              style={styles.currencyDropdownSearchInput}
              placeholder="Search network..."
              placeholderTextColor={colors.neutral[400]}
              value={form.walletNetworkSearchTerm}
              onChangeText={form.setWalletNetworkSearchTerm}
            />
          </View>
          <RecipientFormDropdownList>
            {form.filteredWalletNetworks.map((network) => (
              <Pressable
                key={network}
                android_ripple={ripple.neutral}
                style={[
                  styles.currencyDropdownItem,
                  form.newRecipient.network === network && styles.currencyDropdownItemSelected,
                ]}
                onPress={() => {
                  haptics.tap()
                  form.setNewRecipient((prev) => ({ ...prev, network }))
                  form.setShowWalletNetworkDropdown(false)
                  form.setWalletNetworkSearchTerm('')
                }}
              >
                {getNetworkIconUrl(network) ? (
                  <CachedImage uri={getNetworkIconUrl(network)!} style={styles.cryptoIcon} contentFit="cover" />
                ) : null}
                <View style={styles.currencyInfo}>
                  <Text style={styles.currencyCode}>{network}</Text>
                </View>
                {form.newRecipient.network === network ? (
                  <Check size={18} color={colors.primary.main} strokeWidth={2.5} />
                ) : null}
              </Pressable>
            ))}
          </RecipientFormDropdownList>
        </RegisterRecipientDropdownSheet>
      </View>
    </>
  )
}

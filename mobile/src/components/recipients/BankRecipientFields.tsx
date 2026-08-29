import React from 'react'
import { View, Text, TextInput, Keyboard } from 'react-native'
import {
  recipientFormRequiresSwiftBic,
  ycAccountNumberLabel,
} from '@easner/shared'
import { getAccountTypeConfigFromCurrency } from '../../lib/currencyAccountTypes'
import { getPayoutFieldsSchemaForCorridor } from '../../lib/recipientCatalog'
import { formatAccountNumber, formatIBAN, formatRoutingNumber, formatSortCode } from '../../utils/formatters'
import type { UseRecipientFormStateReturn } from '../../hooks/useRecipientFormState'
import { CorridorRecipientExtraFields, formPatchFromCorridorExtras } from './YcRecipientExtraFields'
import { PayoutSchemaExtraFields } from './PayoutSchemaExtraFields'
import { RecipientOperationalAddressFields } from './RecipientOperationalAddressFields'
import { RecipientBankNameField } from './RecipientBankNameField'
import { UsTransferTypeGrid } from './UsTransferTypeGrid'
import { recipientFormStyles as styles } from './recipientFormStyles'
import { colors } from '../../theme'

type FormSlice = Pick<
  UseRecipientFormStateReturn,
  | 'newRecipient'
  | 'setNewRecipient'
  | 'selectedRecipientType'
  | 'selectedCountryCurrency'
  | 'transferType'
  | 'setTransferType'
  | 'usTransferMethods'
  | 'eurTransferMethods'
  | 'corridorRecipientOptions'
  | 'ycCorridorSchema'
  | 'showsHolderAddress'
  | 'buildFormYcMetadata'
  | 'payoutProvider'
  | 'isSubmitting'
  | 'showBankDropdown'
  | 'setShowBankDropdown'
  | 'bankSearchTerm'
  | 'setBankSearchTerm'
  | 'showSubdivisionDropdown'
  | 'setShowSubdivisionDropdown'
  | 'subdivisionSearchTerm'
  | 'setSubdivisionSearchTerm'
  | 'formScrollRef'
  | 'setShowCurrencyDropdown'
  | 'setShowProviderDropdown'
  | 'setShowWalletAssetDropdown'
  | 'setShowWalletNetworkDropdown'
>

export function BankRecipientFields({ form }: { form: FormSlice }) {
  const accountConfig = form.newRecipient.currency
    ? getAccountTypeConfigFromCurrency(form.newRecipient.currency)
    : null

  if (!accountConfig) {
    return (
      <View style={styles.infoBox}>
        <Text style={styles.infoText}>Please select a currency first to see the required fields</Text>
      </View>
    )
  }

  const closeOtherDropdowns = () => {
    form.setShowCurrencyDropdown(false)
    form.setShowProviderDropdown(false)
    form.setShowWalletAssetDropdown(false)
    form.setShowWalletNetworkDropdown(false)
  }

  return (
    <>
      {accountConfig.accountType === 'us' && form.usTransferMethods.length > 0 ? (
        <UsTransferTypeGrid
          methods={form.usTransferMethods}
          value={form.transferType}
          onChange={form.setTransferType}
          disabled={form.isSubmitting}
        />
      ) : null}
      {accountConfig.accountType === 'euro' && form.eurTransferMethods.length > 0 ? (
        <UsTransferTypeGrid
          methods={form.eurTransferMethods}
          value={form.transferType}
          onChange={form.setTransferType}
          disabled={form.isSubmitting}
        />
      ) : null}

      <View>
        <TextInput
          style={styles.modalInput}
          value={form.newRecipient.fullName}
          onChangeText={(text) => form.setNewRecipient((prev) => ({ ...prev, fullName: text }))}
          placeholder="Account name"
          placeholderTextColor={colors.text.secondary}
          autoCapitalize="words"
          returnKeyType="done"
          onSubmitEditing={() => Keyboard.dismiss()}
          editable={!form.isSubmitting}
        />
      </View>

      <RecipientBankNameField
        banks={accountConfig.accountType === 'us' ? [] : form.corridorRecipientOptions.bankOptions}
        value={form.newRecipient.bankName}
        onChange={(bank) => form.setNewRecipient((prev) => ({ ...prev, bankName: bank }))}
        placeholder={`${accountConfig.fieldLabels.bank_name} *`}
        disabled={form.isSubmitting}
        showDropdown={form.showBankDropdown}
        onToggleDropdown={() => {
          form.setShowBankDropdown(!form.showBankDropdown)
          closeOtherDropdowns()
          form.setShowSubdivisionDropdown(false)
        }}
        searchTerm={form.bankSearchTerm}
        onSearchTermChange={form.setBankSearchTerm}
        onCloseDropdown={() => {
          form.setShowBankDropdown(false)
          form.setBankSearchTerm('')
        }}
      />

      {accountConfig.accountType === 'us' ? (
        <>
          {form.showsHolderAddress && form.selectedCountryCurrency ? (
            <RecipientOperationalAddressFields
              countryCode={form.selectedCountryCurrency.countryCode}
              scrollRef={form.formScrollRef}
              inputStyle={styles.modalInput}
              rowStyle={styles.twoColumnRow}
              halfInputStyle={styles.halfInput}
              values={{
                addressLine1: form.newRecipient.addressLine1,
                city: form.newRecipient.city,
                state: form.newRecipient.state,
                postalCode: form.newRecipient.postalCode,
              }}
              onChange={(patch) => form.setNewRecipient((prev) => ({ ...prev, ...patch }))}
              isSubmitting={form.isSubmitting}
              showSubdivisionDropdown={form.showSubdivisionDropdown}
              onToggleSubdivisionDropdown={() => {
                form.setShowSubdivisionDropdown(!form.showSubdivisionDropdown)
                form.setShowBankDropdown(false)
                closeOtherDropdowns()
              }}
              subdivisionSearchTerm={form.subdivisionSearchTerm}
              onSubdivisionSearchTermChange={form.setSubdivisionSearchTerm}
              onCloseSubdivisionDropdown={() => {
                form.setShowSubdivisionDropdown(false)
                form.setSubdivisionSearchTerm('')
              }}
            />
          ) : null}
          <View>
            <TextInput
              style={styles.modalInput}
              value={form.newRecipient.routingNumber}
              onChangeText={(text) => {
                const formatted = formatRoutingNumber(text)
                form.setNewRecipient((prev) => ({ ...prev, routingNumber: formatted }))
              }}
              placeholder={`${accountConfig.fieldLabels.routing_number} *`}
              placeholderTextColor={colors.text.secondary}
              keyboardType="number-pad"
              maxLength={9}
              autoComplete="off"
              autoCorrect={false}
              textContentType="none"
              editable={!form.isSubmitting}
            />
          </View>
          <View>
            <TextInput
              style={styles.modalInput}
              value={form.newRecipient.accountNumber}
              onChangeText={(text) => {
                const formatted = formatAccountNumber(text)
                form.setNewRecipient((prev) => ({ ...prev, accountNumber: formatted }))
              }}
              placeholder={`${accountConfig.fieldLabels.account_number} *`}
              placeholderTextColor={colors.text.secondary}
              keyboardType="number-pad"
              autoComplete="off"
              autoCorrect={false}
              textContentType="none"
              editable={!form.isSubmitting}
            />
          </View>
        </>
      ) : null}

      {accountConfig.accountType === 'uk' ? (
        <>
          <View style={styles.twoColumnRow}>
            <View style={styles.halfInput}>
              <TextInput
                style={styles.modalInput}
                value={form.newRecipient.sortCode}
                onChangeText={(text) => {
                  const formatted = formatSortCode(text)
                  form.setNewRecipient((prev) => ({ ...prev, sortCode: formatted }))
                }}
                placeholder={`${accountConfig.fieldLabels.sort_code} *`}
                placeholderTextColor={colors.text.secondary}
                keyboardType="number-pad"
                maxLength={8}
                autoComplete="off"
                autoCorrect={false}
                textContentType="none"
                editable={!form.isSubmitting}
              />
            </View>
            <View style={styles.halfInput}>
              <TextInput
                style={styles.modalInput}
                value={form.newRecipient.accountNumber}
                onChangeText={(text) => {
                  const formatted = formatAccountNumber(text)
                  form.setNewRecipient((prev) => ({ ...prev, accountNumber: formatted }))
                }}
                placeholder={`${accountConfig.fieldLabels.account_number} *`}
                placeholderTextColor={colors.text.secondary}
                keyboardType="number-pad"
                autoComplete="off"
                autoCorrect={false}
                textContentType="none"
                editable={!form.isSubmitting}
              />
            </View>
          </View>
          <View>
            <TextInput
              style={styles.modalInput}
              value={form.newRecipient.iban}
              onChangeText={(text) => {
                const formatted = formatIBAN(text)
                form.setNewRecipient((prev) => ({ ...prev, iban: formatted }))
              }}
              placeholder={accountConfig.fieldLabels.iban}
              placeholderTextColor={colors.text.secondary}
              autoCapitalize="characters"
              returnKeyType="done"
              onSubmitEditing={() => Keyboard.dismiss()}
              editable={!form.isSubmitting}
            />
          </View>
          <TextInput
            style={styles.modalInput}
            value={form.newRecipient.swiftBic}
            onChangeText={(text) =>
              form.setNewRecipient((prev) => ({ ...prev, swiftBic: text.toUpperCase() }))
            }
            placeholder={accountConfig.fieldLabels.swift_bic}
            placeholderTextColor={colors.text.secondary}
            autoCapitalize="characters"
            returnKeyType="done"
            onSubmitEditing={() => Keyboard.dismiss()}
            editable={!form.isSubmitting}
          />
        </>
      ) : null}

      {accountConfig.accountType === 'euro' ? (
        <View>
          <TextInput
            style={styles.modalInput}
            value={form.newRecipient.iban}
            onChangeText={(text) => {
              const formatted = formatIBAN(text)
              form.setNewRecipient((prev) => ({ ...prev, iban: formatted }))
            }}
            placeholder={`${accountConfig.fieldLabels.iban} *`}
            placeholderTextColor={colors.text.secondary}
            autoCapitalize="characters"
            returnKeyType="done"
            onSubmitEditing={() => Keyboard.dismiss()}
            editable={!form.isSubmitting}
          />
        </View>
      ) : null}

      {accountConfig.accountType === 'generic' ? (
        <View>
          {(() => {
            const extraFields = form.corridorRecipientOptions.extraFields.length
              ? form.corridorRecipientOptions.extraFields
              : form.ycCorridorSchema?.extra_fields
            const isPix = (extraFields ?? []).some((field) => field.key === 'pix_key_type')
            const pixType = form.newRecipient.ycPixKeyType
            const accountKeyboard = !isPix
              ? 'number-pad'
              : pixType === 'EMAIL'
                ? 'email-address'
                : pixType === 'PHONE' || pixType === 'CPF' || pixType === 'CNPJ'
                  ? 'number-pad'
                  : 'default'
            const accountLabel =
              (form.corridorRecipientOptions.accountNumberLabel &&
              form.corridorRecipientOptions.accountNumberLabel !== 'Account number'
                ? form.corridorRecipientOptions.accountNumberLabel
                : null) ||
              ycAccountNumberLabel(form.ycCorridorSchema) ||
              form.corridorRecipientOptions.accountNumberLabel ||
              accountConfig.fieldLabels.account_number
            const accountNumberField = (
              <View>
                <Text style={styles.fieldLabel}>{accountLabel} *</Text>
                <TextInput
                  style={[styles.modalInput, styles.modalInputFlush]}
                  value={form.newRecipient.accountNumber}
                  onChangeText={(text) => {
                    const formatted = isPix ? text : formatAccountNumber(text)
                    form.setNewRecipient((prev) => ({ ...prev, accountNumber: formatted }))
                  }}
                  placeholder={
                    form.corridorRecipientOptions.accountNumberHint ||
                    form.ycCorridorSchema?.account_number_hint ||
                    `${accountLabel} *`
                  }
                  placeholderTextColor={colors.text.secondary}
                  keyboardType={accountKeyboard}
                  autoCapitalize="none"
                  autoComplete="off"
                  autoCorrect={false}
                  textContentType="none"
                  editable={!form.isSubmitting}
                />
              </View>
            )
            return (
              <CorridorRecipientExtraFields
                fields={extraFields}
                schema={form.ycCorridorSchema}
                values={form.buildFormYcMetadata()}
                onChange={(patch) =>
                  form.setNewRecipient((prev) => ({
                    ...prev,
                    ...formPatchFromCorridorExtras(patch),
                  }))
                }
                isSubmitting={form.isSubmitting}
                accountNumber={accountNumberField}
              />
            )
          })()}
          {form.selectedCountryCurrency &&
          form.selectedRecipientType === 'bank' &&
          recipientFormRequiresSwiftBic({
            currencyCode: form.newRecipient.currency,
            hints: getPayoutFieldsSchemaForCorridor({
              countryCode: form.selectedCountryCurrency.countryCode,
              currencyCode: form.selectedCountryCurrency.currencyCode,
              rail: 'bank_transfer',
            }),
          }) ? (
            <TextInput
              style={styles.modalInput}
              value={form.newRecipient.swiftBic}
              onChangeText={(text) =>
                form.setNewRecipient((prev) => ({ ...prev, swiftBic: text.toUpperCase() }))
              }
              placeholder="SWIFT/BIC *"
              placeholderTextColor={colors.text.secondary}
              autoCapitalize="characters"
              returnKeyType="done"
              onSubmitEditing={() => Keyboard.dismiss()}
              editable={!form.isSubmitting}
            />
          ) : null}
        </View>
      ) : null}

      {form.selectedRecipientType === 'bank' && form.selectedCountryCurrency ? (
        <PayoutSchemaExtraFields
          hints={getPayoutFieldsSchemaForCorridor({
            countryCode: form.selectedCountryCurrency.countryCode,
            currencyCode: form.selectedCountryCurrency.currencyCode,
            rail: 'bank_transfer',
          })}
          values={{
            email: form.newRecipient.email,
            phoneNumber: form.newRecipient.phoneNumber,
          }}
          onChange={(patch) => form.setNewRecipient((prev) => ({ ...prev, ...patch }))}
          isSubmitting={form.isSubmitting}
        />
      ) : null}

      {form.showsHolderAddress &&
      form.selectedCountryCurrency &&
      accountConfig.accountType !== 'us' ? (
        <RecipientOperationalAddressFields
          countryCode={form.selectedCountryCurrency.countryCode}
          scrollRef={form.formScrollRef}
          inputStyle={styles.modalInput}
          rowStyle={styles.twoColumnRow}
          halfInputStyle={styles.halfInput}
          values={{
            addressLine1: form.newRecipient.addressLine1,
            city: form.newRecipient.city,
            state: form.newRecipient.state,
            postalCode: form.newRecipient.postalCode,
          }}
          onChange={(patch) => form.setNewRecipient((prev) => ({ ...prev, ...patch }))}
          isSubmitting={form.isSubmitting}
          showSubdivisionDropdown={form.showSubdivisionDropdown}
          onToggleSubdivisionDropdown={() => {
            form.setShowSubdivisionDropdown(!form.showSubdivisionDropdown)
            form.setShowBankDropdown(false)
            closeOtherDropdowns()
          }}
          subdivisionSearchTerm={form.subdivisionSearchTerm}
          onSubdivisionSearchTermChange={form.setSubdivisionSearchTerm}
          onCloseSubdivisionDropdown={() => {
            form.setShowSubdivisionDropdown(false)
            form.setSubdivisionSearchTerm('')
          }}
        />
      ) : null}
    </>
  )
}

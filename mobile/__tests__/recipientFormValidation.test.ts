import { describe, expect, it, jest } from '@jest/globals'

jest.mock('../src/lib/recipientCatalog', () => ({
  getPayoutFieldsSchemaForCorridor: () => null,
  getCorridorRecipientOptions: () => ({
    bankOptions: [],
    momoOptions: [],
    momoCandidates: [],
    extraFields: [],
  }),
}))

import { buildRecipientYcMetadata } from '../src/lib/recipientForm/buildRecipientYcMetadata'
import { isRecipientFormValid } from '../src/lib/recipientForm/isRecipientFormValid'
import { coerceTransferType, usTransferMethodsForForm } from '../src/lib/recipientForm/recipientTransferMethods'
import {
  emptyRecipientFormValues,
  formatWalletBankLabel,
} from '../src/lib/recipientForm/recipientFormTypes'
import { inferRecipientFormType } from '../src/lib/recipientForm/inferRecipientFormType'
import type { Recipient } from '../src/types'

const baseValidationCtx = {
  selectedRecipientType: 'bank' as const,
  selectedCountryCurrency: {
    countryCode: 'US',
    countryName: 'United States',
    currencyCode: 'USD',
    currencyName: 'US Dollar',
    flagEmoji: '',
  },
  transferType: 'ACH' as string | null,
  usTransferMethods: [{ value: 'ACH', label: 'ACH', speedLabel: '1-3 days' }],
  eurTransferMethods: [],
  corridorRecipientOptions: {
    bankOptions: [],
    momoOptions: [],
    momoCandidates: [],
    extraFields: [],
    accountNumberLabel: undefined,
    accountNumberHint: undefined,
  },
  easenetProfile: null,
  payoutProvider: 'noah' as const,
  ycCorridorSchema: null,
  selectedBankCorridorFieldsSchema: undefined,
}

describe('recipientFormValidation', () => {
  it('emptyRecipientFormValues returns USD defaults', () => {
    const v = emptyRecipientFormValues()
    expect(v.currency).toBe('USD')
    expect(v.fullName).toBe('')
  })

  it('requires US transfer type when corridor offers rails', () => {
    const values = {
      ...emptyRecipientFormValues(),
      fullName: 'Jane Doe',
      bankName: 'Chase',
      routingNumber: '021000021',
      accountNumber: '123456789',
      addressLine1: '1 Main St',
      city: 'New York',
      state: 'NY',
      postalCode: '10001',
    }
    expect(
      isRecipientFormValid({
        ...baseValidationCtx,
        values,
        transferType: null,
      }),
    ).toBe(false)
    expect(
      isRecipientFormValid({
        ...baseValidationCtx,
        values,
        transferType: 'ACH',
      }),
    ).toBe(true)
  })

  it('validates wallet requires network and address', () => {
    const values = {
      ...emptyRecipientFormValues(),
      fullName: 'My wallet',
      currency: 'USDT',
      walletAddress: '0xabc',
      network: '',
    }
    expect(
      isRecipientFormValid({
        ...baseValidationCtx,
        selectedRecipientType: 'wallet',
        values,
      }),
    ).toBe(false)
    expect(
      isRecipientFormValid({
        ...baseValidationCtx,
        selectedRecipientType: 'wallet',
        values: { ...values, network: 'Ethereum' },
      }),
    ).toBe(true)
  })

  it('validates easenet requires resolved profile', () => {
    const values = { ...emptyRecipientFormValues(), payeeEasetag: 'alice' }
    expect(
      isRecipientFormValid({
        ...baseValidationCtx,
        selectedRecipientType: 'easenet',
        values,
        easenetProfile: null,
      }),
    ).toBe(false)
    expect(
      isRecipientFormValid({
        ...baseValidationCtx,
        selectedRecipientType: 'easenet',
        values,
        easenetProfile: {
          easetag: 'alice',
          fullName: 'Alice',
          avatarUrl: null,
          accountKind: 'personal',
        },
      }),
    ).toBe(true)
  })

  it('coerceTransferType picks first allowed when invalid', () => {
    expect(coerceTransferType('Wire', [{ value: 'ACH', label: 'ACH', speedLabel: '' }])).toBe('ACH')
    expect(coerceTransferType('ACH', [{ value: 'ACH', label: 'ACH', speedLabel: '' }])).toBe('ACH')
  })

  it('usTransferMethodsForForm returns empty for non-bank', () => {
    expect(
      usTransferMethodsForForm({
        selectedRecipientType: 'wallet',
        countryCurrency: baseValidationCtx.selectedCountryCurrency,
        payoutProvider: 'noah',
        hasSelectedBankCorridor: true,
      }),
    ).toEqual([])
  })

  it('formatWalletBankLabel uses currency/network', () => {
    expect(formatWalletBankLabel('USDT', 'Ethereum')).toBe('Wallet (USDT/Ethereum)')
  })
})

describe('inferRecipientFormType', () => {
  it('infers wallet type from bank label', () => {
    const recipient = {
      id: 'r1',
      user_id: 'u1',
      full_name: 'Cold',
      account_number: '0xabc',
      bank_name: 'Wallet (USDT/Ethereum)',
      currency: 'USDT',
      wallet_network: 'Ethereum',
      created_at: '',
      updated_at: '',
    } as Recipient
    expect(inferRecipientFormType(recipient)).toBe('wallet')
  })

  it('buildRecipientYcMetadata maps CAD routing for Grid', () => {
    const values = {
      ...emptyRecipientFormValues(),
      currency: 'CAD',
      routingNumber: '12345',
      sortCode: '001',
    }
    const meta = buildRecipientYcMetadata(values, 'CA')
    expect(meta).toBeDefined()
  })
})

import React from 'react'
import { RecipientFormScreenLayout } from './RecipientFormScreenLayout'
import { CountryCurrencySelector } from '../../components/recipients/CountryCurrencySelector'
import { BankRecipientFields } from '../../components/recipients/BankRecipientFields'
import { useRecipientFormScreen } from '../../hooks/useRecipientFormScreen'
import type { NavigationProps } from '../../types'

export default function AddBankRecipientScreen(props: NavigationProps) {
  const { form, editing, title, handleBack, handleCancel, handleSubmit } = useRecipientFormScreen('bank', props)

  return (
    <RecipientFormScreenLayout
      title={title}
      error={form.error}
      submitting={form.isSubmitting}
      submitDisabled={!form.isValid}
      submitLabel={editing ? 'Save' : 'Add'}
      submittingLabel={editing ? 'Saving...' : 'Adding...'}
      scrollEnabled={!form.isAnyDropdownOpen}
      formScrollRef={form.formScrollRef}
      onBack={handleBack}
      onCancel={handleCancel}
      onSubmit={() => void handleSubmit()}
    >
      <CountryCurrencySelector form={form} />
      <BankRecipientFields form={form} />
    </RecipientFormScreenLayout>
  )
}

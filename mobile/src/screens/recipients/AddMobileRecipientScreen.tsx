import React from 'react'
import { RecipientFormScreenLayout } from './RecipientFormScreenLayout'
import { CountryCurrencySelector } from '../../components/recipients/CountryCurrencySelector'
import { MobileRecipientFields } from '../../components/recipients/MobileRecipientFields'
import { useRecipientFormScreen } from '../../hooks/useRecipientFormScreen'
import type { NavigationProps } from '../../types'

export default function AddMobileRecipientScreen(props: NavigationProps) {
  const { form, editing, title, handleBack, handleCancel, handleSubmit } = useRecipientFormScreen('mobile', props)

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
      <MobileRecipientFields form={form} />
    </RecipientFormScreenLayout>
  )
}

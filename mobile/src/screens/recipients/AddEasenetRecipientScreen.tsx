import React from 'react'
import { RecipientFormScreenLayout } from './RecipientFormScreenLayout'
import { EasenetRecipientFields } from '../../components/recipients/EasenetRecipientFields'
import { useRecipientFormScreen } from '../../hooks/useRecipientFormScreen'
import type { NavigationProps } from '../../types'

export default function AddEasenetRecipientScreen(props: NavigationProps) {
  const { form, editing, title, handleBack, handleCancel, handleSubmit, getInitials } = useRecipientFormScreen(
    'easenet',
    props,
  )

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
      <EasenetRecipientFields form={form} getInitials={getInitials} />
    </RecipientFormScreenLayout>
  )
}

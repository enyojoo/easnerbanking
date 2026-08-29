import React from 'react'
import { RecipientFormScreenLayout } from './RecipientFormScreenLayout'
import { WalletRecipientFields } from '../../components/recipients/WalletRecipientFields'
import { useRecipientFormScreen } from '../../hooks/useRecipientFormScreen'
import type { NavigationProps } from '../../types'

export default function AddWalletRecipientScreen(props: NavigationProps) {
  const { form, editing, title, handleBack, handleCancel, handleSubmit } = useRecipientFormScreen('wallet', props)

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
      <WalletRecipientFields form={form} />
    </RecipientFormScreenLayout>
  )
}

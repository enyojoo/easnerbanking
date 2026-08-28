import React, { useCallback } from 'react'
import { RecipientTypePickerModal } from './RecipientTypePickerModal'
import { RecipientFormModal } from './RecipientFormModal'
import type { UseRecipientFormStateReturn } from '../../hooks/useRecipientFormState'

type Props = {
  form: UseRecipientFormStateReturn
  footerPadding: number
  editing?: boolean
  payrollMode?: boolean
  onPayrollDismiss?: () => void
  onSubmit: () => void | Promise<void>
}

export function RecipientFormFlow({
  form,
  footerPadding,
  editing = false,
  payrollMode = false,
  onPayrollDismiss,
  onSubmit,
}: Props) {
  const handleTypePickerClose = useCallback(() => {
    form.setShowRecipientTypeModal(false)
    form.resetForm()
    if (payrollMode) onPayrollDismiss?.()
  }, [form, payrollMode, onPayrollDismiss])

  const handleFormClose = useCallback(() => {
    form.closeAllDropdowns()
    form.setShowBankAccountForm(false)
    form.setError('')
    form.resetForm()
  }, [form])

  return (
    <>
      <RecipientTypePickerModal
        visible={form.showRecipientTypeModal}
        footerPadding={footerPadding}
        hideEasenet={form.hideEasenet}
        payrollMode={payrollMode}
        onClose={handleTypePickerClose}
        onSelectType={form.selectRecipientType}
      />
      <RecipientFormModal
        form={form}
        footerPadding={footerPadding}
        editing={editing}
        onSubmit={onSubmit}
        onClose={handleFormClose}
      />
    </>
  )
}

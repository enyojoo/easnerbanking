import { useCallback } from 'react'
import { BackHandler, Keyboard, Platform } from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import { useQueryClient } from '@tanstack/react-query'
import { useRecipientFormState } from './useRecipientFormState'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../components/ToastProvider'
import { useScope } from '../query/scope'
import { invalidateRecipientsFeed } from '../query/refresh-user-feeds'
import { navigateStackBack } from '../navigation/stackBackNavigation'
import {
  collapseRecipientFormToSendAmount,
  popRecipientFormToList,
  type RecipientFormSharedParams,
} from '../lib/navigateRecipientForm'
import {
  buildDraftRecipientFromForm,
  persistRecipientFromForm,
} from '../lib/submitRecipientForm'
import { recipientFormScreenTitle } from '../components/recipients/recipientFormStyles'
import type { RecipientFormType } from '../lib/recipientForm'
import type { NavigationProps } from '../types'

function getInitials(name: string): string {
  const parts = name.trim().split(' ')
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

export function useRecipientFormScreen(
  routeType: RecipientFormType,
  { navigation, route }: NavigationProps,
) {
  const params = (route.params ?? {}) as RecipientFormSharedParams
  const mode = params.mode === 'draft' ? 'draft' : 'persist'
  const editingRecipient = params.recipient ?? null
  const editing = Boolean(editingRecipient)

  const { user, userProfile } = useAuth()
  const { showError, showSuccess } = useToast()
  const qc = useQueryClient()
  const { scope } = useScope()

  const form = useRecipientFormState({
    initialType: routeType,
    editingRecipient,
    scannedWalletAddress: params.scannedWalletAddress,
    onScannedWalletAddressConsumed: () => {
      navigation.setParams({ scannedWalletAddress: undefined } as never)
    },
    onWalletScanPress:
      routeType === 'wallet' && Platform.OS !== 'web'
        ? () => navigation.navigate('ScanWalletAddress' as never)
        : undefined,
  })

  useFocusEffect(
    useCallback(() => {
      void form.refreshCatalog()
    }, [form.refreshCatalog]),
  )

  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        if (form.isAnyDropdownOpen) {
          form.closeAllDropdowns()
          return true
        }
        return false
      })
      return () => sub.remove()
    }, [form.closeAllDropdowns, form.isAnyDropdownOpen]),
  )

  const title = recipientFormScreenTitle(form.selectedRecipientType, editing)

  const handleBack = useCallback(() => {
    if (form.isAnyDropdownOpen) {
      form.closeAllDropdowns()
      return
    }
    Keyboard.dismiss()
    navigateStackBack(navigation)
  }, [form, navigation])

  const handleCancel = useCallback(() => {
    form.closeAllDropdowns()
    Keyboard.dismiss()
    popRecipientFormToList(navigation)
  }, [form, navigation])

  const handleSubmit = useCallback(async () => {
    if (!userProfile?.id) {
      showError('User not authenticated')
      return
    }
    if (!form.isValid) {
      showError('Please fill in all required fields')
      return
    }

    try {
      form.setIsSubmitting(true)
      form.setError('')

      if (mode === 'draft') {
        const draft = buildDraftRecipientFromForm(userProfile.id, form)
        if ('error' in draft) {
          showError(draft.error)
          return
        }
        const preferred = String(params.preferredBalanceCurrency || '').toUpperCase()
        collapseRecipientFormToSendAmount(navigation, {
          recipient: draft.recipient,
          draftRecipientPersist: draft.persist,
          fromSelectRecentRecipient: true,
          preferredBalanceCurrency: preferred === 'USD' || preferred === 'EUR' ? preferred : undefined,
          selectedPaymentMethod: params.selectedPaymentMethod,
          selectedOtherCurrency: params.selectedOtherCurrency ?? null,
          selectedOtherPaymentMethod: params.selectedOtherPaymentMethod ?? null,
        })
        return
      }

      const saved = await persistRecipientFromForm({
        userProfileId: userProfile.id,
        userId: user?.id,
        form,
      })
      if ('error' in saved) {
        showError(saved.error)
        if (saved.error === 'Not signed in') form.setError('Not signed in')
        return
      }

      if (scope && user?.id) await invalidateRecipientsFeed(qc, scope, user.id)
      showSuccess(saved.updated ? 'Recipient updated successfully' : 'Recipient added successfully')
      popRecipientFormToList(navigation)
    } catch (error) {
      console.error('Error saving recipient:', error)
      const message = editing ? 'Failed to update recipient' : 'Failed to add recipient'
      form.setError(message)
      showError(message)
    } finally {
      form.setIsSubmitting(false)
    }
  }, [
    editing,
    form,
    mode,
    navigation,
    params.preferredBalanceCurrency,
    params.selectedOtherCurrency,
    params.selectedOtherPaymentMethod,
    params.selectedPaymentMethod,
    qc,
    scope,
    showError,
    showSuccess,
    user?.id,
    userProfile?.id,
  ])

  return {
    form,
    editing,
    title,
    handleBack,
    handleCancel,
    handleSubmit,
    getInitials,
  }
}

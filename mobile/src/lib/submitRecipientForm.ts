import { buildDraftRecipient } from './draftRecipient'
import type { RecipientData } from './recipientService'
import { recipientService } from './recipientService'
import {
  buildEasenetPersistPayload,
  buildRecipientPersistPayload,
  type RecipientFormType,
} from './recipientForm'
import type { Recipient } from '../types'
import type { UseRecipientFormStateReturn } from '../hooks/useRecipientFormState'

type FormSlice = Pick<
  UseRecipientFormStateReturn,
  | 'selectedRecipientType'
  | 'easenetProfile'
  | 'newRecipient'
  | 'transferType'
  | 'selectedCountryCurrency'
  | 'validationContext'
  | 'editingRecipient'
>

export function buildRecipientSubmitPayload(form: FormSlice): RecipientData | { error: string } {
  const {
    selectedRecipientType,
    easenetProfile,
    newRecipient,
    transferType,
    selectedCountryCurrency,
    validationContext,
  } = form

  if (selectedRecipientType === 'easenet') {
    if (!easenetProfile) {
      return { error: 'Enter a valid Easetag and wait for the profile to load' }
    }
    return buildEasenetPersistPayload(easenetProfile)
  }

  if (!selectedRecipientType) {
    return { error: 'Please select a recipient type' }
  }

  return buildRecipientPersistPayload({
    values: newRecipient,
    selectedRecipientType,
    selectedCountryCurrency,
    transferType,
    validationContext,
  })
}

export function draftKindForFormType(
  type: RecipientFormType | null,
): 'easenet' | 'wallet' | 'mobile' | 'bank' {
  if (type === 'easenet') return 'easenet'
  if (type === 'wallet') return 'wallet'
  if (type === 'mobile') return 'mobile'
  return 'bank'
}

export function buildDraftRecipientFromForm(
  userProfileId: string,
  form: FormSlice,
): { recipient: Recipient; persist: RecipientData } | { error: string } {
  const payload = buildRecipientSubmitPayload(form)
  if ('error' in payload) return payload
  return {
    persist: payload,
    recipient: buildDraftRecipient(
      userProfileId,
      payload,
      draftKindForFormType(form.selectedRecipientType),
    ),
  }
}

export async function persistRecipientFromForm(args: {
  userProfileId: string
  userId?: string
  form: FormSlice
}): Promise<{ recipient: Recipient; updated: boolean } | { error: string }> {
  const payload = buildRecipientSubmitPayload(args.form)
  if ('error' in payload) return payload

  if (args.form.editingRecipient) {
    if (!args.userId) return { error: 'Not signed in' }
    const updatedRecipient = await recipientService.update(
      args.form.editingRecipient.id,
      args.userId,
      payload,
    )
    return { recipient: updatedRecipient, updated: true }
  }

  const createdRecipient = await recipientService.create(args.userProfileId, payload)
  return { recipient: createdRecipient, updated: false }
}

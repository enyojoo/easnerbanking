import React from 'react'
import { View, Text, TextInput, ActivityIndicator } from 'react-native'
import { EasenetLookupPreview } from '../EasenetLookupPreview'
import { recipientFormStyles as styles } from './recipientFormStyles'
import { colors } from '../../theme'
import type { UseRecipientFormStateReturn } from '../../hooks/useRecipientFormState'

export function EasenetRecipientFields({
  form,
  getInitials,
}: {
  form: Pick<
    UseRecipientFormStateReturn,
    | 'newRecipient'
    | 'setNewRecipient'
    | 'isSubmitting'
    | 'easenetLookupLoading'
    | 'easenetLookupError'
    | 'easenetProfile'
  >
  getInitials: (name: string) => string
}) {
  return (
    <>
      <View style={[styles.searchWrapper, styles.easenetHandleRowMargin]}>
        <Text style={styles.easenetAtPrefix}>@</Text>
        <TextInput
          style={styles.searchInput}
          value={form.newRecipient.payeeEasetag}
          onChangeText={(text) =>
            form.setNewRecipient((prev) => ({ ...prev, payeeEasetag: text.replace(/^@+/, '') }))
          }
          placeholder="handle"
          placeholderTextColor={colors.text.secondary}
          autoCapitalize="none"
          autoCorrect={false}
          editable={!form.isSubmitting}
          underlineColorAndroid="transparent"
        />
        {form.easenetLookupLoading ? (
          <ActivityIndicator size="small" color={colors.primary.main} />
        ) : null}
      </View>
      {form.easenetLookupError ? <Text style={styles.errorText}>{form.easenetLookupError}</Text> : null}
      {form.easenetProfile ? (
        <EasenetLookupPreview
          profile={{
            fullName: form.easenetProfile.fullName,
            easetag: form.easenetProfile.easetag,
            accountKind: form.easenetProfile.accountKind,
            avatarUrl: form.easenetProfile.avatarUrl,
          }}
          getInitials={getInitials}
        />
      ) : null}
    </>
  )
}

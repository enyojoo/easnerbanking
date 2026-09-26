import React from 'react'
import { StyleSheet, Text } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import {
  NG_LOCAL_VERIFICATION_COPY,
  ngSupplementInlinePrompt,
  type NgLocalIdType,
} from '@easner/shared'
import { colors, spacing, textStyles } from '../../theme'
import { haptics } from '../../lib/haptics'

type Props = {
  /** First missing ID (legacy) or full list — both drive the same hub deep-link. */
  missingType?: NgLocalIdType | null
  missingTypes?: NgLocalIdType[] | null
  style?: object
}

export function NgLocalVerificationNotice({ missingType, missingTypes, style }: Props) {
  const navigation = useNavigation()
  const copy = NG_LOCAL_VERIFICATION_COPY
  const missing =
    missingTypes && missingTypes.length > 0
      ? missingTypes
      : missingType
        ? [missingType]
        : null

  if (!missing || missing.length === 0) return null

  return (
    <Text style={[styles.inline, style]}>
      {ngSupplementInlinePrompt(missing)}
      <Text
        style={styles.link}
        onPress={() => {
          haptics.tap()
          navigation.navigate(
            'AccountVerification' as never,
            { focusProduct: 'ng_local' } as never,
          )
        }}
      >
        {copy.inlineLink}
      </Text>
    </Text>
  )
}

const styles = StyleSheet.create({
  inline: {
    ...textStyles.bodySmall,
    color: colors.text.secondary,
    marginBottom: spacing[3],
  },
  link: {
    color: colors.primary.main,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
})

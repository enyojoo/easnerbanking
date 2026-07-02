import React, { useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { KYC_REQUIRED_DOCUMENTS_DIALOG } from '@easner/shared'
import { WebAwareModal } from '../WebAwareModal'
import { colors, spacing, textStyles, fontSize, lineHeight as lineHeightScale } from '../../theme'
import { haptics } from '../../lib/haptics'

type Props = {
  className?: never
  style?: object
}

export function KycRequiredDocumentsNotice({ style }: Props) {
  const [open, setOpen] = useState(false)
  const copy = KYC_REQUIRED_DOCUMENTS_DIALOG

  return (
    <>
      <Text style={[styles.inline, style]}>
        {copy.inlinePrompt}
        <Text
          style={styles.link}
          onPress={() => {
            haptics.tap()
            setOpen(true)
          }}
        >
          {copy.inlineLink}
        </Text>
        {copy.inlineSuffix}
      </Text>
      <WebAwareModal visible={open} onRequestClose={() => setOpen(false)} compact>
        <View style={styles.modalPanel}>
          <Text style={styles.title}>{copy.title}</Text>
          <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
            <Text style={styles.intro}>{copy.intro}</Text>
            {copy.sections.map((section) => (
              <View key={section.heading} style={styles.section}>
                <Text style={styles.sectionHeading}>{section.heading}</Text>
                <Text style={styles.sectionBody}>{section.body}</Text>
              </View>
            ))}
            <Text style={styles.closing}>{copy.closing}</Text>
          </ScrollView>
          <Pressable
            style={styles.closeBtn}
            onPress={() => {
              haptics.tap()
              setOpen(false)
            }}
          >
            <Text style={styles.closeBtnText}>Close</Text>
          </Pressable>
        </View>
      </WebAwareModal>
    </>
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
  modalPanel: {
    padding: spacing[5],
    maxHeight: '85%',
  },
  title: {
    ...textStyles.headlineSmall,
    color: colors.text.primary,
    marginBottom: spacing[3],
  },
  scroll: {
    maxHeight: 360,
  },
  intro: {
    ...textStyles.bodySmall,
    color: colors.text.primary,
    marginBottom: spacing[4],
    lineHeight: Math.round(fontSize.sm * lineHeightScale.relaxed),
  },
  section: {
    marginBottom: spacing[3],
  },
  sectionHeading: {
    ...textStyles.bodyMedium,
    fontWeight: '600',
    color: colors.text.primary,
    marginBottom: spacing[1],
  },
  sectionBody: {
    ...textStyles.bodySmall,
    color: colors.text.secondary,
    lineHeight: Math.round(fontSize.sm * lineHeightScale.relaxed),
  },
  closing: {
    ...textStyles.bodySmall,
    color: colors.text.secondary,
    marginTop: spacing[2],
    marginBottom: spacing[4],
  },
  closeBtn: {
    alignSelf: 'flex-end',
    paddingVertical: spacing[2],
    paddingHorizontal: spacing[4],
  },
  closeBtnText: {
    ...textStyles.bodyMedium,
    color: colors.primary.main,
    fontWeight: '600',
  },
})

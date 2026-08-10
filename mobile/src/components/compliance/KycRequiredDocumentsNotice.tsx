import React, { useState } from 'react'
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native'
import { X } from 'lucide-react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { KYC_REQUIRED_DOCUMENTS_DIALOG } from '@easner/shared'
import { WebAwareModal } from '../WebAwareModal'
import {
  colors,
  spacing,
  textStyles,
  fontSize,
  lineHeight as lineHeightScale,
  borderRadius,
} from '../../theme'
import { haptics } from '../../lib/haptics'
import GlossyPrimaryButton from '../premium/GlossyPrimaryButton'

type Props = {
  className?: never
  style?: object
}

export function KycRequiredDocumentsNotice({ style }: Props) {
  const [open, setOpen] = useState(false)
  const copy = KYC_REQUIRED_DOCUMENTS_DIALOG
  const insets = useSafeAreaInsets()
  const { height: windowHeight } = useWindowDimensions()

  const close = () => {
    haptics.tap()
    setOpen(false)
  }

  const sheetMaxHeight = Math.round(windowHeight * 0.88)
  const bottomPad = Math.max(insets.bottom, spacing[5]) + spacing[2]
  /** Grabber + title row + Got it CTA + gaps — keep an explicit scroll viewport below. */
  const chromeHeight = 56 + 48 + 56 + spacing[3] + spacing[2] + spacing[2]
  const bodyHeight = Math.max(200, sheetMaxHeight - chromeHeight - bottomPad)

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
      <WebAwareModal
        visible={open}
        onRequestClose={close}
        nativePanelStyle={{ maxHeight: sheetMaxHeight }}
        webPanelStyle={{ maxHeight: sheetMaxHeight }}
      >
        <View
          style={[
            styles.modalPanel,
            { paddingBottom: bottomPad, maxHeight: sheetMaxHeight, overflow: 'hidden' },
          ]}
        >
          {Platform.OS !== 'web' ? <View style={styles.grabber} /> : null}
          <View style={styles.modalHeader}>
            <Text style={styles.title} numberOfLines={2}>
              {copy.title}
            </Text>
            <Pressable
              onPress={close}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Close"
              style={styles.closeIconBtn}
            >
              <X size={20} color={colors.text.secondary} strokeWidth={2} />
            </Pressable>
          </View>
          <ScrollView
            style={{ height: bodyHeight }}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator
            bounces
            nestedScrollEnabled
            keyboardShouldPersistTaps="handled"
          >
            <Text style={styles.intro}>{copy.intro}</Text>
            {copy.sections.map((section) => (
              <View key={section.heading} style={styles.section}>
                <Text style={styles.sectionHeading}>{section.heading}</Text>
                <Text style={styles.sectionBody}>{section.body}</Text>
              </View>
            ))}
            <Text style={styles.closing}>{copy.closing}</Text>
          </ScrollView>
          <GlossyPrimaryButton title="Got it" onPress={close} style={styles.closeCta} />
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
    textAlign: 'center',
    alignSelf: 'stretch',
  },
  link: {
    color: colors.primary.main,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
  modalPanel: {
    paddingHorizontal: spacing[5],
    paddingTop: spacing[2],
  },
  grabber: {
    width: 40,
    height: 4,
    borderRadius: borderRadius.full,
    backgroundColor: colors.semantic.border,
    alignSelf: 'center',
    marginBottom: spacing[4],
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing[3],
    marginBottom: spacing[3],
  },
  title: {
    ...textStyles.headlineSmall,
    color: colors.text.primary,
    flex: 1,
  },
  closeIconBtn: {
    width: 36,
    height: 36,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.semantic.muted,
  },
  scrollContent: {
    paddingBottom: spacing[3],
  },
  intro: {
    ...textStyles.bodySmall,
    color: colors.text.primary,
    marginBottom: spacing[4],
    lineHeight: Math.round(fontSize.sm * lineHeightScale.relaxed),
  },
  section: {
    marginBottom: spacing[4],
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
    marginTop: spacing[1],
    marginBottom: spacing[2],
    lineHeight: Math.round(fontSize.sm * lineHeightScale.relaxed),
  },
  closeCta: {
    marginTop: spacing[2],
  },
})

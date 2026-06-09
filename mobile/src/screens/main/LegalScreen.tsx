import React from 'react'
import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native'
import { ArrowLeft, ChevronRight } from 'lucide-react-native'
import ScreenWrapper from '../../components/ScreenWrapper'
import ExternalLinkModal from '../../components/ExternalLinkModal'
import { useExternalLink } from '../../hooks/useExternalLink'
import { NavigationProps } from '../../types'
import { colors, surfaceFrameStyle, surfaceChromeCircleStyle, textStyles, spacing, fontFamily } from '../../theme'
import { ripple } from '../../lib/androidRipple'
import { haptics } from '../../lib/haptics'
import { useScrollBottomPadding } from '../../hooks/useScrollBottomPadding'

export default function LegalScreen({ navigation }: NavigationProps) {
  const scrollBottomPadding = useScrollBottomPadding(spacing[4])
  const privacyLink = useExternalLink()
  const termsLink = useExternalLink()

  return (
    <ScreenWrapper>
      <View style={styles.container}>
        <View style={styles.header}>
          <Pressable
            android_ripple={ripple.neutral}
            style={styles.backButton}
            onPress={async () => {
              haptics.tap()
              navigation.goBack()
            }}
          >
            <ArrowLeft size={24} color={colors.primary.main} strokeWidth={2} />
          </Pressable>
          <View style={styles.headerContent}>
            <Text style={styles.title}>Legal</Text>
          </View>
        </View>

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: scrollBottomPadding }]}
        >
          <View style={styles.sectionCard}>
            <View style={styles.sectionContent}>
              <Pressable
                android_ripple={ripple.neutral}
                style={styles.row}
                onPress={async () => {
                  haptics.tap()
                  privacyLink.openLink('https://www.easner.com/privacy', 'Privacy Policy')
                }}
              >
                <View style={styles.rowTextBlock}>
                  <Text style={styles.rowTitle}>Privacy Policy</Text>
                  <Text style={styles.rowSubtitle}>How we collect, use, and protect your data</Text>
                </View>
                <ChevronRight size={20} color={colors.neutral[400]} strokeWidth={2} />
              </Pressable>

              <Pressable
                android_ripple={ripple.neutral}
                style={[styles.row, styles.rowLast]}
                onPress={async () => {
                  haptics.tap()
                  termsLink.openLink('https://www.easner.com/terms', 'Terms of Service')
                }}
              >
                <View style={styles.rowTextBlock}>
                  <Text style={styles.rowTitle}>Terms of Service</Text>
                  <Text style={styles.rowSubtitle}>Your rights and responsibilities using Easner</Text>
                </View>
                <ChevronRight size={20} color={colors.neutral[400]} strokeWidth={2} />
              </Pressable>
            </View>
          </View>
        </ScrollView>
      </View>
      <ExternalLinkModal
        visible={privacyLink.isVisible}
        url={privacyLink.url}
        title={privacyLink.title}
        onClose={privacyLink.closeLink}
      />
      <ExternalLinkModal
        visible={termsLink.isVisible}
        url={termsLink.url}
        title={termsLink.title}
        onClose={termsLink.closeLink}
      />

    </ScreenWrapper>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background.primary,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing[5],
    paddingTop: spacing[4],
    paddingBottom: spacing[4],
  },
  backButton: {
    ...surfaceChromeCircleStyle(colors, 44),
    marginRight: spacing[3],
  },
  headerContent: {
    flex: 1,
  },
  title: {
    ...textStyles.headlineMedium,
    color: colors.text.primary,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: spacing[5],
  },
  sectionCard: {
    ...surfaceFrameStyle(colors),
    paddingTop: spacing[2],
    paddingBottom: spacing[2],
  },
  sectionContent: {
    paddingHorizontal: spacing[5],
    paddingBottom: spacing[2],
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing[4],
    borderBottomWidth: 1,
    borderBottomColor: colors.frame.border,
  },
  rowLast: {
    borderBottomWidth: 0,
  },
  rowTextBlock: {
    flex: 1,
    minWidth: 0,
    paddingRight: spacing[2],
  },
  rowTitle: {
    ...textStyles.bodyMedium,
    color: colors.text.primary,
    fontFamily: fontFamily.medium,
  },
  rowSubtitle: {
    ...textStyles.bodySmall,
    color: colors.text.secondary,
    marginTop: 2,
  },
})

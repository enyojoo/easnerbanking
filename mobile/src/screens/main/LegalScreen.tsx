import React from 'react'
import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native'
import { ArrowLeft, ChevronRight, FileText, Newspaper } from 'lucide-react-native'
import * as Haptics from 'expo-haptics'
import ScreenWrapper from '../../components/ScreenWrapper'
import ExternalLinkModal from '../../components/ExternalLinkModal'
import { useExternalLink } from '../../hooks/useExternalLink'
import { NavigationProps } from '../../types'
import { colors, surfaceFrameStyle, surfaceChromeCircleStyle, textStyles, spacing, borderRadius, fontFamily } from '../../theme'
import { ripple } from '../../lib/androidRipple'

export default function LegalScreen({ navigation }: NavigationProps) {
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
              await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
              navigation.goBack()
            }}
          >
            <ArrowLeft size={24} color={colors.primary.main} strokeWidth={2} />
          </Pressable>
          <Text style={styles.title}>Legal</Text>
        </View>

        <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
          <View style={styles.sectionCard}>
            <View style={styles.sectionContent}>
              <Pressable
                android_ripple={ripple.neutral}
                style={styles.row}
                onPress={async () => {
                  await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
                  privacyLink.openLink('https://www.easner.com/privacy', 'Privacy Policy')
                }}
              >
                <View style={styles.rowLeft}>
                  <View style={styles.iconWrap}>
                    <FileText size={18} color={colors.text.secondary} strokeWidth={2} />
                  </View>
                  <View>
                    <Text style={styles.rowTitle}>Privacy Policy</Text>
                    <Text style={styles.rowSubtitle}>How we collect, use, and protect your data</Text>
                  </View>
                </View>
                <ChevronRight size={20} color={colors.neutral[400]} strokeWidth={2} />
              </Pressable>

              <Pressable
                android_ripple={ripple.neutral}
                style={[styles.row, styles.rowLast]}
                onPress={async () => {
                  await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
                  termsLink.openLink('https://www.easner.com/terms', 'Terms of Service')
                }}
              >
                <View style={styles.rowLeft}>
                  <View style={styles.iconWrap}>
                    <Newspaper size={18} color={colors.text.secondary} strokeWidth={2} />
                  </View>
                  <View>
                    <Text style={styles.rowTitle}>Terms of Service</Text>
                    <Text style={styles.rowSubtitle}>Your rights and responsibilities using Easner</Text>
                  </View>
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
    gap: spacing[3],
    paddingHorizontal: spacing[5],
    paddingTop: spacing[4],
    paddingBottom: spacing[2],
  },
  backButton: {
    ...surfaceChromeCircleStyle(colors, 40),
  },
  title: {
    ...textStyles.headlineLarge,
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
  rowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    flex: 1,
    minWidth: 0,
  },
  iconWrap: {
    width: 28,
    height: 28,
    borderRadius: borderRadius.full,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background.primary,
    borderWidth: 0.5,
    borderColor: colors.frame.border,
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

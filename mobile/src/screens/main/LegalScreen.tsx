import React from 'react'
import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import * as Haptics from 'expo-haptics'
import ScreenWrapper from '../../components/ScreenWrapper'
import ExternalLinkModal from '../../components/ExternalLinkModal'
import { useExternalLink } from '../../hooks/useExternalLink'
import { NavigationProps } from '../../types'
import { colors, textStyles, spacing, borderRadius } from '../../theme'
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
            <Ionicons name="arrow-back" size={24} color={colors.text.primary} />
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
                    <Ionicons name="document-text-outline" size={18} color={colors.text.secondary} />
                  </View>
                  <View>
                    <Text style={styles.rowTitle}>Privacy Policy</Text>
                    <Text style={styles.rowSubtitle}>How we collect, use, and protect your data</Text>
                  </View>
                </View>
                <Ionicons name="chevron-forward" size={20} color={colors.neutral[400]} />
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
                    <Ionicons name="newspaper-outline" size={18} color={colors.text.secondary} />
                  </View>
                  <View>
                    <Text style={styles.rowTitle}>Terms of Service</Text>
                    <Text style={styles.rowSubtitle}>Your rights and responsibilities using Easner</Text>
                  </View>
                </View>
                <Ionicons name="chevron-forward" size={20} color={colors.neutral[400]} />
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
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.frame.background,
    borderWidth: 0.5,
    borderColor: colors.frame.border,
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
    backgroundColor: colors.frame.background,
    borderRadius: 24,
    borderWidth: 0.5,
    borderColor: colors.frame.border,
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
    fontFamily: 'Outfit-Medium',
  },
  rowSubtitle: {
    ...textStyles.bodySmall,
    color: colors.text.secondary,
    marginTop: 2,
  },
})

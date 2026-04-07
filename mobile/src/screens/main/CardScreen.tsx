import React from 'react'
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Dimensions,
} from 'react-native'
import { Plus } from 'lucide-react-native'
import * as Haptics from 'expo-haptics'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Svg, { Path } from 'react-native-svg'
import ScreenWrapper from '../../components/ScreenWrapper'
import { NavigationProps } from '../../types'
import { colors, textStyles, borderRadius, spacing, shadows } from '../../theme'

const { width: SCREEN_WIDTH } = Dimensions.get('window')

/** Preview placeholder until Easner cards launch. */
const PREVIEW = {
  last4: '0000',
  holder: 'CARDHOLDER',
}

function VisaLogo({ width = 56, height = 18 }: { width?: number; height?: number }) {
  return (
    <Svg width={width} height={height} viewBox="0 0 780 500" fill="none">
      <Path
        d="M489.823 143.111C442.988 143.111 401.134 167.393 401.134 212.256C401.134 263.706 475.364 267.259 475.364 293.106C475.364 303.989 462.895 313.731 441.6 313.731C411.377 313.731 388.789 300.119 388.789 300.119L379.123 345.391C379.123 345.391 405.145 356.889 439.692 356.889C490.898 356.889 531.19 331.415 531.19 285.784C531.19 231.419 456.652 227.971 456.652 203.981C456.652 195.455 466.887 186.114 488.122 186.114C512.081 186.114 531.628 196.014 531.628 196.014L541.087 152.289C541.087 152.289 519.818 143.111 489.823 143.111Z"
        fill="#FFFFFF"
      />
    </Svg>
  )
}

export default function CardScreen({ navigation }: NavigationProps) {
  const insets = useSafeAreaInsets()
  const cardWidth = Math.min(SCREEN_WIDTH - spacing[5] * 2, 340)

  return (
    <ScreenWrapper>
      <View style={styles.container}>
        <View style={[styles.header, { paddingTop: insets.top + spacing[4] }]}>
          <Text style={styles.headerTitle}>My cards</Text>
          <TouchableOpacity
            style={styles.iconBtn}
            onPress={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)}
            accessibilityRole="button"
            accessibilityLabel="Add card"
          >
            <Plus size={20} color={colors.text.primary} strokeWidth={2.5} />
          </TouchableOpacity>
        </View>

        <ScrollView
          contentContainerStyle={{
            paddingBottom: insets.bottom + spacing[8],
            paddingHorizontal: spacing[5],
          }}
          showsVerticalScrollIndicator={false}
        >
          <View style={[styles.cardWrap, { width: cardWidth, alignSelf: 'center' }]}>
            <View style={[styles.cardFace, { width: cardWidth }]}>
              <View style={styles.cardPattern} />
              <View style={styles.comingSoonOverlay}>
                <Text style={styles.comingSoonText}>
                  Easner cards are coming soon.
                </Text>
              </View>
              <View style={styles.cardInner}>
                <View style={styles.cardTop}>
                  <Text style={styles.brand}>Easner</Text>
                  <Text style={styles.chip}>virtual</Text>
                </View>
                <Text style={styles.pan}>•••• •••• •••• {PREVIEW.last4}</Text>
                <View style={styles.cardBottom}>
                  <View>
                    <Text style={styles.label}>Card holder</Text>
                    <Text style={styles.holder}>{PREVIEW.holder}</Text>
                  </View>
                  <VisaLogo />
                </View>
              </View>
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Card activity</Text>
            <View style={styles.emptyBox}>
              <Text style={styles.emptyText}>
                When you can spend on a card, those movements will show up here.
              </Text>
            </View>
          </View>
        </ScrollView>
      </View>
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
    justifyContent: 'space-between',
    paddingHorizontal: spacing[5],
    marginBottom: spacing[2],
  },
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    ...textStyles.titleLarge,
    color: colors.text.primary,
  },
  cardWrap: {
    marginTop: spacing[4],
  },
  cardFace: {
    aspectRatio: 1.586,
    borderRadius: borderRadius.xl,
    overflow: 'hidden',
    backgroundColor: '#0F172A',
    ...shadows.md,
  },
  cardPattern: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.12,
    backgroundColor: '#0099e6',
  },
  comingSoonOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
    zIndex: 6,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing[5],
  },
  comingSoonText: {
    ...textStyles.bodyMedium,
    color: '#fff',
    textAlign: 'center',
    fontFamily: 'Outfit-Medium',
  },
  cardInner: {
    flex: 1,
    padding: spacing[5],
    justifyContent: 'space-between',
    zIndex: 2,
  },
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  brand: {
    color: 'rgba(255,255,255,0.95)',
    fontFamily: 'Outfit-SemiBold',
    fontSize: 18,
  },
  chip: {
    fontSize: 10,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.85)',
    textTransform: 'uppercase',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  pan: {
    fontFamily: 'DMMono-Regular',
    fontSize: 16,
    letterSpacing: 2,
    color: '#fff',
  },
  cardBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  label: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.6)',
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  holder: {
    fontSize: 13,
    fontWeight: '600',
    color: '#fff',
    letterSpacing: 1,
  },
  section: {
    marginTop: spacing[8],
  },
  sectionTitle: {
    ...textStyles.titleMedium,
    color: colors.text.primary,
    marginBottom: spacing[3],
  },
  emptyBox: {
    backgroundColor: '#F9F9F9',
    borderRadius: 24,
    borderWidth: 0.5,
    borderColor: '#E2E2E2',
    padding: spacing[5],
  },
  emptyText: {
    ...textStyles.bodyMedium,
    color: colors.text.secondary,
    lineHeight: 22,
  },
})

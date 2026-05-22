import React, { useRef } from 'react'
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Platform,
  Animated,
  useWindowDimensions,
} from 'react-native'
import { CachedImage } from '../../components/CachedImage'
import { LinearGradient } from 'expo-linear-gradient'
import { BlurView } from 'expo-blur'
import * as Haptics from 'expo-haptics'
import { Plus, Snowflake, Settings, Eye } from 'lucide-react-native'
import Svg, { Circle, Path } from 'react-native-svg'
import ScreenWrapper from '../../components/ScreenWrapper'
import { NavigationProps } from '../../types'
import { colors, surfaceFrameStyle, surfaceChromeCircleStyle, textStyles, borderRadius, spacing, motion, fontFamily } from '../../theme'
import { useCalmParallelEnterWhen } from '../../hooks/useCalmParallelEnter'
import { ripple } from '../../lib/androidRipple'
import { EASNER_CARD_ICON_SOURCE } from '../../lib/easnerBrand'

const CARD_SPACING = spacing[1]

const COMING_SOON_COPY = 'Easner Card is coming soon'

/** Preview — single placeholder until API-backed carousel; layout stays multi-card ready. */
const MOCK_CARDS = [
  {
    id: '2',
    form: 'physical' as const,
    last4: '1234',
    cardholderName: 'Jane Public',
  },
]

function gradientForForm(form: 'virtual' | 'physical'): [string, string, string] {
  return form === 'physical'
    ? ['#0F1110', '#151817', '#1C201E']
    : ['#050606', '#0F1110', '#1C201E']
}

/** Dot + line texture without SVG `<Pattern>` — Pattern fills break on RN New Architecture. */
function CardPattern({ width, height }: { width: number; height: number }) {
  const dots: React.ReactNode[] = []
  for (let y = 2; y < height; y += 40) {
    for (let x = 2; x < width; x += 40) {
      dots.push(<Circle key={`d-${x}-${y}`} cx={x} cy={y} r={1.5} fill="#FFFFFF" />)
    }
  }
  const lines: React.ReactNode[] = []
  for (let i = -height; i < width + height; i += 60) {
    lines.push(
      <Path
        key={`l-${i}`}
        d={`M${i} ${height} L${i + height} 0`}
        stroke="#FFFFFF"
        strokeWidth={0.5}
        fill="none"
      />,
    )
  }
  return (
    <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={styles.cardPatternSvg}>
      {dots}
      {lines}
    </Svg>
  )
}

function MastercardMark() {
  return (
    <Svg width={56} height={36} viewBox="0 0 56 36" fill="none">
      <Circle cx={20} cy={18} r={14} fill="#EB001B" />
      <Circle cx={36} cy={18} r={14} fill="#F79E1B" />
    </Svg>
  )
}

export default function CardScreen({ navigation: _navigation }: NavigationProps) {
  const { width: windowWidth } = useWindowDimensions()
  /** ISO/IEC 7810 ID-1 physical card ratio (85.60mm × 53.98mm). */
  const CARD_ASPECT = 85.6 / 53.98
  /** Full-bleed minus screen padding; cap keeps very wide tablets from oversized carousel cards. */
  const CARD_WIDTH = Math.min(windowWidth - spacing[5] * 2, 420)
  const CARD_HEIGHT = Math.round(CARD_WIDTH / CARD_ASPECT)
  const cardStride = CARD_WIDTH + CARD_SPACING * 2

  const scrollX = useRef(new Animated.Value(0)).current
  const headerAnim = useRef(new Animated.Value(0)).current
  const contentAnim = useRef(new Animated.Value(0)).current

  useCalmParallelEnterWhen(true, headerAnim, contentAnim)

  const actionsComingSoon = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
  }

  const handleCardScroll = Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }], {
    useNativeDriver: false,
  })

  return (
    <ScreenWrapper>
      <View style={styles.container}>
        <Animated.View
          style={[
            styles.header,
            {
              opacity: headerAnim,
              transform: [
                {
                  translateY: headerAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [-motion.screenEnterTranslateY, 0],
                  }),
                },
              ],
            },
          ]}
        >
          <View style={styles.headerContent}>
            <View style={styles.headerTitleBlock}>
              <Text style={styles.title}>Cards</Text>
            </View>
            <Pressable
             android_ripple={ripple.neutral}
              style={styles.iconBtn}
              onPress={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)} accessibilityRole="button"
              accessibilityLabel="Add card"
            >
              <Plus size={22} color={colors.primary.main} strokeWidth={2} />
            </Pressable>
          </View>
        </Animated.View>

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: spacing[8] },
          ]}
          showsVerticalScrollIndicator={false}
        >
          <Animated.View
            style={[
              styles.scrollInner,
              {
                opacity: contentAnim,
                transform: [
                  {
                    translateY: contentAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [motion.screenEnterTranslateY, 0],
                    }),
                  },
                ],
              },
            ]}
          >
          <View style={[styles.carouselContainer, { height: CARD_HEIGHT + spacing[8] }]}>
            <Animated.ScrollView
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              onScroll={handleCardScroll}
              scrollEventThrottle={16}
              snapToInterval={cardStride}
              decelerationRate="fast"
              contentContainerStyle={[
                styles.carouselContent,
                { paddingHorizontal: (windowWidth - CARD_WIDTH) / 2, gap: CARD_SPACING * 2 },
              ]}
              contentInsetAdjustmentBehavior="never"
            >
              {MOCK_CARDS.map((card, index) => {
                const inputRange = [(index - 1) * cardStride, index * cardStride, (index + 1) * cardStride]
                const scale = scrollX.interpolate({
                  inputRange,
                  outputRange: [0.96, 1, 0.96],
                  extrapolate: 'clamp',
                })
                const heightScale = scrollX.interpolate({
                  inputRange,
                  outputRange: [0.96, 1, 0.96],
                  extrapolate: 'clamp',
                })
                const opacity = scrollX.interpolate({
                  inputRange,
                  outputRange: [0.8, 1, 0.8],
                  extrapolate: 'clamp',
                })
                const gradient = gradientForForm(card.form)

                return (
                  <Animated.View
                    key={card.id}
                    style={[
                      styles.cardWrapper,
                      {
                        width: CARD_WIDTH,
                        marginRight: CARD_SPACING,
                        transform: [{ scale }],
                        height: Animated.multiply(CARD_HEIGHT, heightScale),
                        opacity,
                      },
                    ]}
                  >
                    <LinearGradient
                      colors={gradient}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={[styles.card, { width: CARD_WIDTH, height: CARD_HEIGHT }]}
                    >
                      <View style={styles.patternLayer}>
                        <CardPattern width={CARD_WIDTH} height={CARD_HEIGHT} />
                      </View>

                      <View style={styles.cardInner}>
                        <View style={styles.cardTopRow}>
                          <View style={styles.brandRow}>
                            <CachedImage
                              source={EASNER_CARD_ICON_SOURCE}
                              style={styles.brandIcon}
                              contentFit="contain"
                              prefetch={false}
                              accessibilityIgnoresInvertColors
                            />
                            <View style={styles.formBadge}>
                              <Text style={styles.formBadgeText}>{card.form}</Text>
                            </View>
                          </View>
                          <MastercardMark />
                        </View>

                        <View style={styles.panBlock}>
                          <Text style={styles.panText} numberOfLines={1}>
                            •••• •••• •••• {card.last4}
                          </Text>
                        </View>

                        <View style={styles.cardBottomMeta}>
                          <View style={styles.metaCol}>
                            <Text style={styles.metaLabel}>Card holder</Text>
                            <Text style={styles.metaValue} numberOfLines={1}>
                              {card.cardholderName.toUpperCase()}
                            </Text>
                          </View>
                          <View style={[styles.metaCol, styles.metaColEnd]}>
                            <Text style={styles.metaLabel}>Expires</Text>
                            <Text style={styles.metaValue}>••/••</Text>
                          </View>
                        </View>
                      </View>
                    </LinearGradient>

                    <View style={styles.comingSoonWrap} pointerEvents="auto">
                      <BlurView
                        intensity={Platform.OS === 'ios' ? 8 : 24}
                        tint="dark"
                        experimentalBlurMethod={
                          Platform.OS === 'android' ? 'dimezisBlurView' : undefined
                        }
                        style={StyleSheet.absoluteFill}
                      />
                      <View style={styles.comingSoonScrim} pointerEvents="none" />
                      <View style={styles.comingSoonTextCol} pointerEvents="none">
                        <Text style={styles.comingSoonText}>{COMING_SOON_COPY}</Text>
                      </View>
                    </View>
                  </Animated.View>
                )
              })}
            </Animated.ScrollView>
          </View>

          <View style={styles.actionButtons}>
            <Pressable android_ripple={ripple.neutral} style={styles.actionButton} onPress={actionsComingSoon} >
              <View style={[styles.actionIconContainer, styles.actionIconDisabled]}>
                <Eye size={20} color={colors.text.tertiary} strokeWidth={2.5} />
              </View>
              <Text style={styles.actionButtonTextDisabled}>View</Text>
            </Pressable>

            <Pressable android_ripple={ripple.neutral} style={styles.actionButton} onPress={actionsComingSoon} >
              <View style={[styles.actionIconContainer, styles.actionIconDisabled]}>
                <Snowflake size={20} color={colors.text.tertiary} strokeWidth={2.5} />
              </View>
              <Text style={styles.actionButtonTextDisabled}>Freeze</Text>
            </Pressable>

            <Pressable android_ripple={ripple.neutral} style={styles.actionButton} onPress={actionsComingSoon} >
              <View style={[styles.actionIconContainer, styles.actionIconDisabled]}>
                <Settings size={20} color={colors.text.tertiary} strokeWidth={2.5} />
              </View>
              <Text style={styles.actionButtonTextDisabled}>Settings</Text>
            </Pressable>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Card activity</Text>
            <View style={styles.emptyBox}>
              <Text style={styles.emptyText}>
                When you can spend on a card, those movements will show up here.
              </Text>
            </View>
          </View>
          </Animated.View>
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
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
  scrollInner: {
    flexGrow: 1,
  },
  header: {
    paddingHorizontal: spacing[5],
    paddingTop: spacing[4],
    paddingBottom: spacing[2],
  },
  headerContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  headerTitleBlock: {
    flex: 1,
    minWidth: 0,
    alignItems: 'flex-start',
    justifyContent: 'flex-start',
    paddingRight: spacing[3],
  },
  title: {
    ...textStyles.headlineLarge,
    color: colors.text.primary,
  },
  iconBtn: {
    ...surfaceChromeCircleStyle(colors, 40),
    flexShrink: 0,
  },
  carouselContainer: {
    marginTop: spacing[3],
    marginBottom: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  carouselContent: {
    alignItems: 'center',
  },
  cardWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 24,
    overflow: 'hidden',
  },
  card: {
    borderRadius: 24,
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: colors.neutral.black,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 12,
      },
      android: {
        elevation: 8,
      },
    }),
  },
  cardPatternSvg: {
    opacity: 1,
  },
  patternLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1,
    opacity: 0.1,
  },
  cardInner: {
    flex: 1,
    zIndex: 2,
    paddingHorizontal: spacing[6],
    paddingTop: spacing[6],
    paddingBottom: spacing[6],
    justifyContent: 'space-between',
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    flexShrink: 1,
  },
  brandIcon: {
    height: 40,
    width: 40,
    opacity: 0.95,
  },
  formBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
  },
  formBadgeText: {
    fontSize: 10,
    fontWeight: '500',
    color: 'rgba(255, 255, 255, 0.9)',
    textTransform: 'lowercase',
    letterSpacing: 0.5,
    fontFamily: fontFamily.medium,
  },
  panBlock: {
    paddingVertical: spacing[4],
  },
  panText: {
    fontFamily: fontFamily.mono,
    fontSize: 14,
    letterSpacing: 3.2,
    color: colors.neutral.white,
  },
  cardBottomMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    gap: spacing[4],
  },
  metaCol: {
    flexShrink: 1,
  },
  metaColEnd: {
    alignItems: 'flex-end',
  },
  metaLabel: {
    fontSize: 10,
    fontWeight: '500',
    color: 'rgba(255, 255, 255, 0.6)',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    fontFamily: fontFamily.medium,
    marginBottom: 4,
  },
  metaValue: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.neutral.white,
    fontFamily: fontFamily.semibold,
    letterSpacing: 0.6,
  },
  comingSoonWrap: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 10,
    borderRadius: 24,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
  },
  comingSoonScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
  },
  comingSoonTextCol: {
    maxWidth: 280,
    paddingHorizontal: spacing[5],
    zIndex: 2,
  },
  comingSoonText: {
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '500',
    color: colors.neutral.white,
    textAlign: 'center',
    fontFamily: fontFamily.medium,
  },
  actionButtons: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing[3],
    paddingHorizontal: spacing[5],
    marginTop: 2,
    marginBottom: spacing[4],
  },
  actionButton: {
    flex: 1,
    alignItems: 'center',
    gap: spacing[2],
  },
  actionIconContainer: {
    ...surfaceChromeCircleStyle(colors, 60),
  },
  actionIconDisabled: {
    opacity: 0.55,
  },
  actionButtonTextDisabled: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text.tertiary,
    fontFamily: fontFamily.medium,
  },
  section: {
    marginTop: spacing[4],
    paddingHorizontal: spacing[5],
  },
  sectionTitle: {
    ...textStyles.headlineSmall,
    color: colors.text.primary,
    fontFamily: fontFamily.semibold,
    marginBottom: spacing[3],
  },
  emptyBox: {
    ...surfaceFrameStyle(colors, { shadow: 'none' }),
    padding: spacing[5],
  },
  emptyText: {
    ...textStyles.bodyMedium,
    color: colors.text.secondary,
    lineHeight: 22,
  },
})

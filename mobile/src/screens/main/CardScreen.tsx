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
  Image,
} from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { Plus, Snowflake, Settings, Eye, CreditCard } from 'lucide-react-native'
import Svg, { Circle, Path } from 'react-native-svg'
import ScreenWrapper from '../../components/ScreenWrapper'
import EmptyState from '../../components/EmptyState'
import { NavigationProps } from '../../types'
import { colors, surfaceFrameStyle, surfaceChromeCircleStyle, textStyles, borderRadius, spacing, motion, fontFamily } from '../../theme'
import { useCalmParallelEnterWhen } from '../../hooks/useCalmParallelEnter'
import { ripple } from '../../lib/androidRipple'
import { EASNER_CARD_ICON_SOURCE } from '../../lib/easnerBrand'
import { haptics } from '../../lib/haptics'
import { useResponsiveLayout } from '../../contexts/ResponsiveLayoutContext'

const CARD_SPACING = spacing[1]

const COMING_SOON_COPY = 'Easner Card is coming soon'

type PreviewCard = {
  id: string
  form: 'virtual' | 'physical'
  last4: string
  cardholderName: string
  expiryDate: string
}

/** Preview — single placeholder until API-backed carousel; layout stays multi-card ready. */
const MOCK_CARDS: PreviewCard[] = [
  {
    id: '2',
    form: 'physical',
    last4: '1234',
    cardholderName: 'Jane Public',
    expiryDate: '••/••',
  },
]

function gradientForForm(form: 'virtual' | 'physical'): [string, string, string] {
  return form === 'physical'
    ? ['#0F1110', '#151817', '#1C201E']
    : ['#050606', '#0F1110', '#1C201E']
}

function CardPattern({ width, height }: { width: number; height: number }) {
  const dots: React.ReactNode[] = []
  const lines: React.ReactNode[] = []
  const dotStep = 40
  const lineStep = 60

  for (let y = 2; y < height; y += dotStep) {
    for (let x = 2; x < width; x += dotStep) {
      dots.push(<Circle key={`d-${x}-${y}`} cx={x} cy={y} r={1.5} fill="white" />)
    }
  }

  for (let x = -height; x < width; x += lineStep) {
    lines.push(
      <Path
        key={`l-${x}`}
        d={`M${x} ${height} L${x + height} 0`}
        stroke="white"
        strokeWidth={0.5}
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
  const { mode } = useResponsiveLayout()
  const { width: windowWidth } = useWindowDimensions()
  const centerCardLayout = mode === 'tablet' || mode === 'desktop'
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
    haptics.tap()
  }

  const handleCardScroll = Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }], {
    useNativeDriver: false,
  })

  return (
    <ScreenWrapper>
      <View style={[styles.container, centerCardLayout && styles.centeredContainer]}>
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
              onPress={() => haptics.tap()} accessibilityRole="button"
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
                        height: CARD_HEIGHT,
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
                      {card.form === 'physical' ? <View style={styles.physicalAccent} /> : null}
                      <View style={styles.patternLayer}>
                        <CardPattern width={CARD_WIDTH} height={CARD_HEIGHT} />
                      </View>

                      <View style={styles.cardInner}>
                        <View style={styles.cardTopRow}>
                          <View style={styles.brandRow}>
                            <Image
                              source={EASNER_CARD_ICON_SOURCE}
                              style={styles.brandIcon}
                              resizeMode="contain"
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
                            <Text style={styles.metaValue}>{card.expiryDate}</Text>
                          </View>
                        </View>
                      </View>
                    </LinearGradient>

                    <View style={styles.comingSoonWrap} pointerEvents="none">
                      <View style={styles.comingSoonScrim} />
                      <View style={styles.comingSoonTextCol}>
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
            <EmptyState
              icon={CreditCard}
              title="No card activity yet"
              message="When you can spend on a card, those movements will show up here."
            />
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
  centeredContainer: {
    maxWidth: 480,
    alignSelf: 'center',
    width: '100%',
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
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 24,
    overflow: 'hidden',
  },
  card: {
    backgroundColor: '#0F1110',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(246, 243, 235, 0.06)',
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
  physicalAccent: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: 'rgba(15, 138, 95, 0.9)',
    zIndex: 3,
  },
  patternLayer: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
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
    opacity: 0.9,
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
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 10,
    borderRadius: 24,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing[5],
  },
  /** Business-style coming-soon layer: light tint so the card face remains visible. */
  comingSoonScrim: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.78)',
  },
  comingSoonTextCol: {
    maxWidth: 280,
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

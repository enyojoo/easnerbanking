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
import { CardsDesktopSplit } from '../../components/layout/CardsDesktopSplit'
import { NavigationProps } from '../../types'
import { colors, surfaceFrameStyle, surfaceChromeCircleStyle, textStyles, borderRadius, spacing, motion, fontFamily } from '../../theme'
import { useCalmParallelEnterWhen } from '../../hooks/useCalmParallelEnter'
import { ripple } from '../../lib/androidRipple'
import { EASNER_CARD_ICON_SOURCE } from '../../lib/easnerBrand'
import { haptics } from '../../lib/haptics'
import { useResponsiveLayout } from '../../contexts/ResponsiveLayoutContext'
import { useScrollBottomPadding } from '../../hooks/useScrollBottomPadding'

const CARD_SPACING = spacing[1]
const DESKTOP_CARD_MAX_WIDTH = 400
const SHELL_MAIN_PADDING = spacing[8]

const COMING_SOON_COPY = 'Easner Card is coming soon'

type PreviewCard = {
  id: string
  form: 'virtual' | 'physical'
  last4: string
  cardholderName: string
  expiryDate: string
}

/** Preview – single placeholder until API-backed carousel; layout stays multi-card ready. */
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

type CardFaceProps = {
  card: PreviewCard
  width: number
  height: number
  style?: object
}

function CardFace({ card, width, height, style }: CardFaceProps) {
  const gradient = gradientForForm(card.form)

  return (
    <View style={[styles.cardWrapper, { width, height }, style]}>
      <LinearGradient
        colors={gradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.card, { width, height }]}
      >
        {card.form === 'physical' ? <View style={styles.physicalAccent} /> : null}
        <View style={styles.patternLayer}>
          <CardPattern width={width} height={height} />
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
    </View>
  )
}

function MobileActionButtons({ onPress }: { onPress: () => void }) {
  return (
    <View style={styles.actionButtons}>
      <Pressable android_ripple={ripple.neutral} style={styles.actionButton} onPress={onPress}>
        <View style={[styles.actionIconContainer, styles.actionIconDisabled]}>
          <Eye size={20} color={colors.text.tertiary} strokeWidth={2.5} />
        </View>
        <Text style={styles.actionButtonTextDisabled}>View</Text>
      </Pressable>

      <Pressable android_ripple={ripple.neutral} style={styles.actionButton} onPress={onPress}>
        <View style={[styles.actionIconContainer, styles.actionIconDisabled]}>
          <Snowflake size={20} color={colors.text.tertiary} strokeWidth={2.5} />
        </View>
        <Text style={styles.actionButtonTextDisabled}>Freeze</Text>
      </Pressable>

      <Pressable android_ripple={ripple.neutral} style={styles.actionButton} onPress={onPress}>
        <View style={[styles.actionIconContainer, styles.actionIconDisabled]}>
          <Settings size={20} color={colors.text.tertiary} strokeWidth={2.5} />
        </View>
        <Text style={styles.actionButtonTextDisabled}>Settings</Text>
      </Pressable>
    </View>
  )
}

function DesktopActionButtons({ onPress }: { onPress: () => void }) {
  const items = [
    { Icon: Eye, label: 'View Details' },
    { Icon: Settings, label: 'Card Settings' },
    { Icon: Snowflake, label: 'Freeze Card' },
  ] as const

  return (
    <View style={styles.desktopActions}>
      {items.map(({ Icon, label }) => (
        <Pressable
          key={label}
          android_ripple={ripple.neutral}
          style={styles.desktopActionButton}
          onPress={onPress}
          accessibilityRole="button"
          accessibilityLabel={label}
        >
          <Icon size={18} color={colors.text.tertiary} strokeWidth={2} />
          <Text style={styles.desktopActionButtonText}>{label}</Text>
        </Pressable>
      ))}
    </View>
  )
}

function CardActivitySection({
  wide,
  scrollable,
}: {
  wide: boolean
  scrollable?: boolean
}) {
  const content = (
    <EmptyState
      icon={CreditCard}
      title="No card activity yet"
      message="When you can spend on a card, those movements will show up here."
    />
  )

  if (wide) {
    return (
      <View style={styles.desktopActivityColumn}>
        <Text style={styles.desktopActivityTitle}>Card activity</Text>
        <View style={styles.desktopActivityPanel}>
          {scrollable ? (
            <ScrollView
              style={styles.desktopActivityScroll}
              contentContainerStyle={styles.desktopActivityScrollContent}
              showsVerticalScrollIndicator
            >
              {content}
            </ScrollView>
          ) : (
            <View style={styles.desktopActivityScrollContent}>{content}</View>
          )}
        </View>
      </View>
    )
  }

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Card activity</Text>
      {content}
    </View>
  )
}

export default function CardScreen({ navigation: _navigation }: NavigationProps) {
  const { mode, showSidebarShell, width: layoutWidth, sidebarWidth } = useResponsiveLayout()
  const { width: windowWidth } = useWindowDimensions()
  const scrollBottomPadding = useScrollBottomPadding(spacing[4], { tabScreen: true })
  const wideLayout = showSidebarShell && mode === 'desktop'
  const shellLayout = showSidebarShell && !wideLayout
  const centerCardLayout = !showSidebarShell && (mode === 'tablet' || mode === 'desktop')
  const showAddCardPill = shellLayout || wideLayout

  const mainContentWidth = shellLayout
    ? layoutWidth - sidebarWidth - SHELL_MAIN_PADDING * 2
    : windowWidth
  const carouselLaneWidth = shellLayout ? mainContentWidth - spacing[5] * 2 : mainContentWidth

  const CARD_ASPECT = 85.6 / 53.98
  const CARD_WIDTH = wideLayout
    ? DESKTOP_CARD_MAX_WIDTH
    : Math.min(
        shellLayout ? carouselLaneWidth : mainContentWidth - spacing[5] * 2,
        DESKTOP_CARD_MAX_WIDTH,
      )
  const CARD_HEIGHT = Math.round(CARD_WIDTH / CARD_ASPECT)
  const cardStride = CARD_WIDTH + CARD_SPACING * 2
  const carouselSidePadding = shellLayout
    ? Math.max(0, (carouselLaneWidth - CARD_WIDTH) / 2)
    : (mainContentWidth - CARD_WIDTH) / 2

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

  const header = (
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
        <View style={styles.headerTitleWrap}>
          <Text style={styles.title}>Cards</Text>
        </View>
        <Pressable
          android_ripple={ripple.neutral}
          style={showAddCardPill ? styles.addCardButton : styles.iconBtn}
          onPress={() => haptics.tap()}
          accessibilityRole="button"
          accessibilityLabel="Add card"
        >
          <Plus
            size={showAddCardPill ? 18 : 22}
            color={showAddCardPill ? colors.text.inverse : colors.primary.main}
            strokeWidth={2}
          />
          {showAddCardPill ? <Text style={styles.addCardButtonText}>Add Card</Text> : null}
        </Pressable>
      </View>
    </Animated.View>
  )

  const cardCarousel = wideLayout ? (
    <View style={[styles.desktopCarousel, { height: CARD_HEIGHT }]}>
      {MOCK_CARDS.map((card) => (
        <CardFace key={card.id} card={card} width={CARD_WIDTH} height={CARD_HEIGHT} />
      ))}
    </View>
  ) : (
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
          { paddingHorizontal: carouselSidePadding, gap: CARD_SPACING * 2 },
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

          return (
            <Animated.View
              key={card.id}
              style={{
                width: CARD_WIDTH,
                marginRight: CARD_SPACING,
                transform: [{ scale }],
                height: CARD_HEIGHT,
                opacity,
              }}
            >
              <CardFace card={card} width={CARD_WIDTH} height={CARD_HEIGHT} />
            </Animated.View>
          )
        })}
      </Animated.ScrollView>
    </View>
  )

  const animatedBodyStyle = {
    opacity: contentAnim,
    transform: [
      {
        translateY: contentAnim.interpolate({
          inputRange: [0, 1],
          outputRange: [motion.screenEnterTranslateY, 0],
        }),
      },
    ],
  }

  if (wideLayout) {
    return (
      <ScreenWrapper>
        <View style={styles.desktopRoot}>
          {header}
          <Animated.View style={[styles.desktopBody, styles.shellContentInset, animatedBodyStyle]}>
            <CardsDesktopSplit
              sidebar={
                <View style={styles.desktopSidebarInner}>
                  {cardCarousel}
                  <DesktopActionButtons onPress={actionsComingSoon} />
                </View>
              }
              main={<CardActivitySection wide scrollable />}
            />
          </Animated.View>
        </View>
      </ScreenWrapper>
    )
  }

  if (shellLayout) {
    return (
      <ScreenWrapper>
        <View style={styles.container}>
          {header}
          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={[styles.scrollContent, { paddingBottom: scrollBottomPadding }]}
            showsVerticalScrollIndicator={false}
          >
            <Animated.View style={[styles.scrollInner, animatedBodyStyle]}>
              <View style={styles.shellContentInset}>
                {cardCarousel}
                <DesktopActionButtons onPress={actionsComingSoon} />
              </View>
              <CardActivitySection wide={false} />
            </Animated.View>
          </ScrollView>
        </View>
      </ScreenWrapper>
    )
  }

  return (
    <ScreenWrapper>
      <View style={[styles.container, centerCardLayout && styles.centeredContainer]}>
        {header}

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: scrollBottomPadding }]}
          showsVerticalScrollIndicator={false}
        >
          <Animated.View style={[styles.scrollInner, animatedBodyStyle]}>
            {cardCarousel}
            <MobileActionButtons onPress={actionsComingSoon} />
            <CardActivitySection wide={false} />
          </Animated.View>
        </ScrollView>
      </View>
    </ScreenWrapper>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.semantic.background,
  },
  centeredContainer: {
    maxWidth: 480,
    alignSelf: 'center',
    width: '100%',
  },
  desktopRoot: {
    flex: 1,
    minHeight: 0,
    backgroundColor: colors.semantic.background,
    ...Platform.select({
      web: {
        height: '100%',
      },
    }),
  },
  desktopBody: {
    flex: 1,
    minHeight: 0,
  },
  desktopSidebarInner: {
    gap: spacing[6],
    width: '100%',
    alignSelf: 'flex-start',
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
    paddingBottom: spacing[3],
  },
  headerContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing[3],
  },
  headerTitleWrap: {
    flex: 1,
  },
  shellContentInset: {
    paddingHorizontal: spacing[5],
  },
  title: {
    ...textStyles.headlineLarge,
    color: colors.text.primary,
    fontFamily: fontFamily.semibold,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  iconBtn: {
    ...surfaceChromeCircleStyle(colors, 40),
    flexShrink: 0,
  },
  addCardButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    backgroundColor: colors.primary.main,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[2],
    borderRadius: borderRadius.full,
    flexShrink: 0,
  },
  addCardButtonText: {
    ...textStyles.labelLarge,
    color: colors.text.inverse,
    fontFamily: fontFamily.semibold,
  },
  carouselContainer: {
    marginTop: spacing[3],
    marginBottom: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  desktopCarousel: {
    alignItems: 'center',
    justifyContent: 'center',
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
      web: {
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.2)',
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
  desktopActions: {
    gap: spacing[2],
  },
  desktopActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[2],
    width: '100%',
    paddingVertical: spacing[3],
    paddingHorizontal: spacing[4],
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: colors.border.default,
    backgroundColor: 'transparent',
    opacity: 0.85,
  },
  desktopActionButtonText: {
    ...textStyles.bodyMedium,
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
  desktopActivityColumn: {
    flex: 1,
    minHeight: 0,
    minWidth: 0,
  },
  desktopActivityTitle: {
    ...textStyles.headlineSmall,
    color: colors.text.primary,
    fontFamily: fontFamily.semibold,
    marginBottom: spacing[4],
  },
  desktopActivityPanel: {
    flex: 1,
    minHeight: 0,
    borderWidth: 1,
    borderColor: colors.border.default,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.semantic.card,
    overflow: 'hidden',
  },
  desktopActivityScroll: {
    flex: 1,
  },
  desktopActivityScrollContent: {
    flexGrow: 1,
    padding: spacing[4],
    justifyContent: 'center',
  },
})

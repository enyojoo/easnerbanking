import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Animated,
  TextInput,
  Platform,
  Keyboard,
  ActivityIndicator,
} from 'react-native'
import { FlashList } from '@shopify/flash-list'
import { ArrowLeft, CircleX, ChevronRight, Search, Users } from 'lucide-react-native'
import {
  fetchEasenetPublicProfileCached,
  primeEasenetPublicProfileCache,
  warmEasenetPublicProfiles,
} from '../../lib/easenetProfile'
import { EasenetRecipientHydratedPreview } from '../../components/EasenetRecipientHydratedPreview'
import { RecipientPayoutPreview } from '../../components/RecipientPayoutPreview'
import { ListRowSkeleton } from '../../components/skeletons'
import EmptyState from '../../components/EmptyState'
import { isEasenetRecipientRecord, resolveRecipientEasetagForUi } from '../../lib/easenetRecipientUi'
import {
  mergeLastSentMaps,
  sortRecipientsForSendHub,
  filterRecipientsBySearch,
} from '../../lib/recentSendRecipients'
import { buildDraftEasenetRecipient, isDraftEasenetRecipient } from '../../lib/draftEasenetRecipient'
import type { RecipientData } from '../../lib/recipientService'
import { NavigationProps, Recipient } from '../../types'
import {
  colors,
  shadows,
  surfaceChromeCircleStyle,
  surfaceFrameStyle,
  textStyles,
  borderRadius,
  spacing,
  motion,
  fontFamily,
  searchFieldWrapperStyle,
  searchFieldInputStyle,
} from '../../theme'
import { useCalmParallelEnterWhen } from '../../hooks/useCalmParallelEnter'
import { ripple } from '../../lib/androidRipple'
import ScreenWrapper from '../../components/ScreenWrapper'
import { useFixedFooterPadding, useScrollPaddingAboveFooter } from '../../hooks/useScrollBottomPadding'
import KeyboardSafeContainer from '../../components/KeyboardSafeContainer'
import { useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../../contexts/AuthContext'
import { useRecipientsList, useTransactionsList, mapLedgerRowToTransaction, TRANSACTIONS_LEDGER_PAGE_SIZE } from '../../hooks/queries'
import { prefetchSendRatesForRecipient } from '../../lib/warmSendRateCaches'
import { useFocusRefresh } from '../../hooks/useFocusRefresh'
import { haptics } from '../../lib/haptics'
import { analytics } from '../../lib/analytics'
import { exitSendFlowFromHub } from '../../navigation/stackBackNavigation'
import { navigateToAddRecipient } from '../../lib/navigateRecipientForm'
import { preloadRecipientTypeScreen } from '../../lib/preloadRecipientFormScreens'

const getInitials = (name: string): string => {
  const parts = name.trim().split(' ')
  if (parts.length === 1) {
    return parts[0].substring(0, 2).toUpperCase()
  }
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

export default function SelectRecentRecipientScreen({ navigation, route }: NavigationProps) {
  const listBottomPadding = useScrollPaddingAboveFooter()
  const footerPadding = useFixedFooterPadding(spacing[4])
  const { user, userProfile } = useAuth()
  const preferredBalanceCurrency = String((route.params as any)?.preferredBalanceCurrency || '').toUpperCase()
  const routePaymentMethod = (route.params as any)?.selectedPaymentMethod as
    | 'balance'
    | 'linkBank'
    | 'virtualBank'
    | 'otherCurrency'
    | undefined
  const routeOtherCurrency = (route.params as any)?.selectedOtherCurrency as string | undefined
  const routeOtherPaymentMethod = (route.params as any)?.selectedOtherPaymentMethod as string | undefined
  const qc = useQueryClient()
  const recipientsQuery = useRecipientsList()
  const txHubQuery = useTransactionsList({}, TRANSACTIONS_LEDGER_PAGE_SIZE)
  const queryRecipients = recipientsQuery.data ?? []
  const recipients = queryRecipients
  const recipientsLoading = recipientsQuery.isPending && recipients.length === 0
  const transactions = useMemo(() => {
    if (!user?.id) return []
    const rows = txHubQuery.data?.pages?.[0]?.transactions ?? []
    return (rows as Record<string, unknown>[]).map((r) => mapLedgerRowToTransaction(user.id, r))
  }, [txHubQuery.data, user?.id])
  const [searchTerm, setSearchTerm] = useState('')
  const [lastSentAtByRecipient, setLastSentAtByRecipient] = useState<Record<string, number>>({})

  const headerAnim = useRef(new Animated.Value(0)).current
  const contentAnim = useRef(new Animated.Value(0)).current

  useCalmParallelEnterWhen(true, headerAnim, contentAnim)

  useFocusRefresh(
    () => {
      void recipientsQuery.refetch()
      void txHubQuery.refetch()
    },
    5 * 60 * 1000,
    false,
  )

  useEffect(() => {
    if (!user?.id) {
      setLastSentAtByRecipient({})
      return
    }
    let cancelled = false
    void mergeLastSentMaps(user.id, transactions).then((merged) => {
      if (!cancelled) setLastSentAtByRecipient(merged)
    })
    return () => {
      cancelled = true
    }
  }, [user?.id, transactions])

  const { sorted: hubSorted } = useMemo(
    () => sortRecipientsForSendHub(recipients, lastSentAtByRecipient),
    [recipients, lastSentAtByRecipient],
  )

  const hubDisplayRecipients = useMemo(
    () => filterRecipientsBySearch(hubSorted, searchTerm),
    [hubSorted, searchTerm],
  )

  useEffect(() => {
    const easenetRows = recipients.filter((r) => isEasenetRecipientRecord(r))
    if (easenetRows.length === 0) return
    void Promise.allSettled(
      easenetRows.map((row) =>
        primeEasenetPublicProfileCache(resolveRecipientEasetagForUi(row), {
          fullName: row.full_name,
          avatarUrl: row.payee_avatar_url,
          accountKind: row.payee_account_kind,
        }),
      ),
    )
    void warmEasenetPublicProfiles(easenetRows.map((row) => resolveRecipientEasetagForUi(row)))
  }, [recipients])

  /** Hub search (@mode) live lookup — separate from add-recipient modal. */
  const [hubSearchEasenet, setHubSearchEasenet] = useState<{
    easetag: string
    fullName: string
    avatarUrl: string | null
    accountKind: 'business' | 'personal'
  } | null>(null)
  const [hubSearchLoading, setHubSearchLoading] = useState(false)
  const [hubSearchError, setHubSearchError] = useState<string | null>(null)

  useEffect(() => {
    const t = searchTerm.trim()
    if (!t.startsWith('@')) {
      setHubSearchEasenet(null)
      setHubSearchLoading(false)
      setHubSearchError(null)
      return
    }
    const raw = t.replace(/^@+/, '').trim()
    if (raw.length < 4) {
      setHubSearchEasenet(null)
      setHubSearchLoading(false)
      setHubSearchError(null)
      return
    }
    let cancelled = false
    setHubSearchLoading(true)
    setHubSearchError(null)
    const timer = setTimeout(() => {
      void (async () => {
        const res = await fetchEasenetPublicProfileCached(raw)
        if (cancelled) return
        setHubSearchLoading(false)
        if (res.found) {
          setHubSearchEasenet({
            easetag: res.easetag,
            fullName: res.fullName,
            avatarUrl: res.avatarUrl,
            accountKind: res.accountKind,
          })
          setHubSearchError(null)
        } else {
          setHubSearchEasenet(null)
          setHubSearchError(
            res.reason === 'self' ? 'You cannot add yourself as a recipient.' : 'Easetag not found.',
          )
        }
      })()
    }, 450)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [searchTerm])

  const hubVirtualRecipient = useMemo(() => {
    if (!hubSearchEasenet || !userProfile?.id) return null
    return buildDraftEasenetRecipient({
      easetag: hubSearchEasenet.easetag,
      fullName: hubSearchEasenet.fullName,
      avatarUrl: hubSearchEasenet.avatarUrl,
      userId: userProfile.id,
      accountKind: hubSearchEasenet.accountKind,
    })
  }, [hubSearchEasenet, userProfile?.id])

  const sendHubFlatListData = useMemo(() => {
    if (!hubVirtualRecipient) return hubDisplayRecipients
    return [hubVirtualRecipient, ...hubDisplayRecipients]
  }, [hubVirtualRecipient, hubDisplayRecipients])

  const navigateToSendAmount = useCallback(
    (recipient: Recipient, draftRecipientPersist?: RecipientData) => {
      navigation.navigate('SendAmount' as never, {
        recipient,
        ...(draftRecipientPersist ? { draftRecipientPersist } : {}),
        fromSelectRecentRecipient: true,
        preferredBalanceCurrency:
          preferredBalanceCurrency === 'USD' || preferredBalanceCurrency === 'EUR'
            ? preferredBalanceCurrency
            : undefined,
        selectedPaymentMethod: routePaymentMethod,
        selectedOtherCurrency: routeOtherCurrency ?? null,
        selectedOtherPaymentMethod: routeOtherPaymentMethod ?? null,
      } as never)
    },
    [
      navigation,
      preferredBalanceCurrency,
      routePaymentMethod,
      routeOtherCurrency,
      routeOtherPaymentMethod,
    ],
  )

  const handleSelectRecipient = async (recipient: Recipient) => {
    haptics.tap()
    analytics.trackRecipientSelected({ recipientId: recipient.id, country: recipient.country_code })
    prefetchSendRatesForRecipient(qc, recipient)
    navigateToSendAmount(recipient)
  }

  const handleAddNewRecipient = () => {
    haptics.tap()
    navigateToAddRecipient(navigation, {
      mode: 'draft',
      preferredBalanceCurrency:
        preferredBalanceCurrency === 'USD' || preferredBalanceCurrency === 'EUR'
          ? preferredBalanceCurrency
          : undefined,
      selectedPaymentMethod: routePaymentMethod,
      selectedOtherCurrency: routeOtherCurrency ?? null,
      selectedOtherPaymentMethod: routeOtherPaymentMethod ?? null,
    })
  }

  const renderRecipient = ({ item, index }: { item: Recipient; index: number }) => {
    const isDraftEasenet = isDraftEasenetRecipient(item.id)
    const isEasenet = isEasenetRecipientRecord(item)
    const isLast = index === sendHubFlatListData.length - 1
    return (
      <Pressable
        android_ripple={ripple.neutral}
        style={[styles.recipientItem, !isLast && styles.recipientItemDivider]}
        onPressIn={() => {
          prefetchSendRatesForRecipient(qc, item)
        }}
        onPress={() => handleSelectRecipient(item)}
      >
        <View style={styles.recipientRow}>
          <View style={[styles.recipientPreviewSlot, isDraftEasenet && styles.recipientPreviewSlotWithBadge]}>
            {isEasenet ? (
              <EasenetRecipientHydratedPreview recipient={item} variant="row" getInitials={getInitials} />
            ) : (
              <RecipientPayoutPreview recipient={item} variant="row" getInitials={getInitials} />
            )}
            {isDraftEasenet ? (
              <View style={[styles.newRecipientBadge, styles.newRecipientBadgeCorner]} pointerEvents="none">
                <Text style={styles.newRecipientBadgeText}>New</Text>
              </View>
            ) : null}
          </View>
          <ChevronRight size={20} color={colors.text.secondary} strokeWidth={2} />
        </View>
      </Pressable>
    )
  }

  const screenBody = (
    <>
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
          <Pressable
            android_ripple={ripple.neutral}
            onPress={() => {
              haptics.tap()
              exitSendFlowFromHub(navigation)
            }}
            style={styles.backButton}
          >
            <ArrowLeft size={24} color={colors.primary.main} strokeWidth={2} />
          </Pressable>
          <View style={styles.headerContent}>
            <Text style={styles.title}>Send Money</Text>
          </View>
        </Animated.View>

        <Animated.View
          style={[
            styles.searchContainer,
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
          <View style={styles.searchWrapper}>
            <Search size={18} color={colors.primary.main} strokeWidth={2} />
            <TextInput
              style={styles.searchInput}
              value={searchTerm}
              onChangeText={setSearchTerm}
              placeholder="Search @easetag or recipients"
              placeholderTextColor={colors.text.secondary}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="done"
              onSubmitEditing={() => Keyboard.dismiss()}
            />
            {searchTerm.trim().startsWith('@') && hubSearchLoading ? (
              <ActivityIndicator size="small" color={colors.primary.main} />
            ) : null}
            {searchTerm.length > 0 && !(searchTerm.trim().startsWith('@') && hubSearchLoading) ? (
              <Pressable android_ripple={ripple.neutral} onPress={() => setSearchTerm('')}>
                <CircleX size={18} color={colors.primary.main} strokeWidth={2} />
              </Pressable>
            ) : null}
          </View>
          {searchTerm.trim().startsWith('@') && hubSearchError && !hubSearchLoading && !hubVirtualRecipient ? (
            <Text style={styles.searchErrorText}>{hubSearchError}</Text>
          ) : null}
        </Animated.View>

        <Animated.View
          style={[
            styles.recipientsTray,
            styles.listTray,
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
          {recipientsLoading && recipients.length === 0 ? (
            <View>
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <ListRowSkeleton key={i} variant="recipient" showDivider={i < 5} />
              ))}
            </View>
          ) : (
            <FlashList
              data={sendHubFlatListData}
              renderItem={renderRecipient}
              keyExtractor={(item) => item.id}
              style={styles.list}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              estimatedItemSize={112}
              drawDistance={400}
              contentContainerStyle={{ paddingBottom: listBottomPadding }}
              ListEmptyComponent={
                <EmptyState
                  icon={Users}
                  title={searchTerm.trim() ? 'No matches' : 'No recipients found'}
                  message={
                    searchTerm.trim() ? 'Try another search' : 'Add a new recipient to get started'
                  }
                  action={
                    !searchTerm.trim()
                      ? { label: 'Add recipient', onPress: handleAddNewRecipient }
                      : undefined
                  }
                />
              }
            />
          )}
        </Animated.View>

        <View style={[styles.bottomButtonContainer, { paddingBottom: footerPadding }]}>
          <Pressable
            android_ripple={ripple.neutral}
            style={styles.addRecipientButton}
            onPressIn={preloadRecipientTypeScreen}
            onPress={handleAddNewRecipient}
          >
            <Text style={styles.addRecipientButtonText}>Add a recipient</Text>
          </Pressable>
        </View>
      </View>
    </>
  )

  return (
    <ScreenWrapper>
      {Platform.OS === 'android' ? (
        screenBody
      ) : (
        <KeyboardSafeContainer>{screenBody}</KeyboardSafeContainer>
      )}
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
    justifyContent: 'center',
  },
  title: {
    ...textStyles.headlineMedium,
    color: colors.text.primary,
  },
  searchContainer: {
    paddingHorizontal: spacing[5],
    marginBottom: spacing[4],
  },
  searchWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    ...surfaceFrameStyle(colors, { shadow: 'none', radius: borderRadius.full }),
    paddingHorizontal: spacing[4],
    ...searchFieldWrapperStyle,
    gap: spacing[2],
  },
  searchInput: {
    ...searchFieldInputStyle,
    color: colors.text.primary,
  },
  searchErrorText: {
    ...textStyles.bodySmall,
    color: colors.error.main,
    fontFamily: fontFamily.regular,
    marginTop: spacing[2],
    paddingHorizontal: spacing[1],
  },
  recipientsTray: {
    ...surfaceFrameStyle(colors),
    marginHorizontal: spacing[5],
    overflow: 'hidden',
  },
  listTray: {
    flex: 1,
    minHeight: 0,
    marginBottom: 0,
  },
  list: {
    flex: 1,
  },
  recipientItem: {
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[5],
    minHeight: 80,
    justifyContent: 'center',
  },
  recipientItemDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border.light,
  },
  recipientRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  recipientPreviewSlot: {
    flex: 1,
    minWidth: 0,
    position: 'relative',
  },
  recipientPreviewSlotWithBadge: {
    paddingRight: 44,
  },
  newRecipientBadge: {
    backgroundColor: colors.primary.main + '18',
    paddingHorizontal: spacing[2],
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
  },
  newRecipientBadgeCorner: {
    position: 'absolute',
    top: 0,
    right: 0,
    zIndex: 2,
    elevation: 2,
  },
  newRecipientBadgeText: {
    ...textStyles.bodySmall,
    fontFamily: fontFamily.semibold,
    color: colors.primary.main,
    fontSize: 11,
  },
  bottomButtonContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.background.primary,
    paddingHorizontal: spacing[5],
    paddingTop: spacing[4],
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.frame.border,
    ...Platform.select({
      ios: shadows.md,
      android: {
        elevation: 0,
        shadowColor: 'transparent',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0,
        shadowRadius: 0,
      },
    }),
  },
  addRecipientButton: {
    backgroundColor: colors.primary.main,
    borderRadius: borderRadius.full,
    paddingVertical: spacing[4],
    alignItems: 'center',
    justifyContent: 'center',
  },
  addRecipientButtonText: {
    ...textStyles.bodyLarge,
    color: colors.text.inverse,
    fontFamily: fontFamily.semibold,
  },
})

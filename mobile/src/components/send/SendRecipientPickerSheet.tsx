import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
} from 'react-native'
import { Plus, Search } from 'lucide-react-native'
import { WebAwareModal } from '../WebAwareModal'
import { SendSelectedRecipientSummary } from './SendSelectedRecipientSummary'
import { useRecipientsList, useTransactionsList, mapLedgerRowToTransaction } from '../../hooks/queries'
import { useAuth } from '../../contexts/AuthContext'
import {
  filterRecipientsBySearch,
  mergeLastSentMaps,
  sortRecipientsForSendHub,
} from '../../lib/recentSendRecipients'
import { buildDraftEasenetRecipient } from '../../lib/draftEasenetRecipient'
import { fetchEasenetPublicProfileCached } from '../../lib/easenetProfile'
import type { Recipient } from '../../types'
import { colors, textStyles, spacing, borderRadius, fontFamily, searchFieldWrapperStyle, searchFieldInputStyle } from '../../theme'
import { ripple } from '../../lib/androidRipple'
import { haptics } from '../../lib/haptics'
import type { NavigationProp } from '@react-navigation/native'

type Props = {
  visible: boolean
  onClose: () => void
  onSelect: (recipient: Recipient) => void
  navigation: NavigationProp<Record<string, unknown>>
  preferredBalanceCurrency?: string
}

export function SendRecipientPickerSheet({
  visible,
  onClose,
  onSelect,
  navigation,
  preferredBalanceCurrency,
}: Props) {
  const { user } = useAuth()
  const recipientsQuery = useRecipientsList()
  const txHubQuery = useTransactionsList({}, 100)
  const [searchTerm, setSearchTerm] = useState('')
  const [lastSentAtByRecipient, setLastSentAtByRecipient] = useState<Record<string, number>>({})
  const [hubSearchEasenet, setHubSearchEasenet] = useState<{
    easetag: string
    fullName: string
    avatarUrl: string | null
    accountKind: 'business' | 'personal'
  } | null>(null)
  const [hubSearchLoading, setHubSearchLoading] = useState(false)
  const [hubSearchError, setHubSearchError] = useState<string | null>(null)

  const recipients = recipientsQuery.data ?? []

  const transactions = useMemo(() => {
    if (!user?.id) return []
    const rows = txHubQuery.data?.pages?.[0]?.transactions ?? []
    return (rows as Record<string, unknown>[]).map((r) => mapLedgerRowToTransaction(user.id, r))
  }, [txHubQuery.data, user?.id])

  useEffect(() => {
    if (!user?.id) return
    void mergeLastSentMaps(user.id, transactions).then(setLastSentAtByRecipient)
  }, [user?.id, transactions])

  useEffect(() => {
    if (!visible) {
      setSearchTerm('')
      setHubSearchEasenet(null)
      setHubSearchLoading(false)
      setHubSearchError(null)
    }
  }, [visible])

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
      void fetchEasenetPublicProfileCached(raw).then((res) => {
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
      })
    }, 450)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [searchTerm])

  const sortedRecipients = useMemo(
    () => sortRecipientsForSendHub(recipients, lastSentAtByRecipient).sorted,
    [recipients, lastSentAtByRecipient],
  )

  const hubDisplayRecipients = useMemo(
    () => filterRecipientsBySearch(sortedRecipients, searchTerm),
    [sortedRecipients, searchTerm],
  )

  const hubVirtualRecipient = useMemo(() => {
    if (!hubSearchEasenet) return null
    return buildDraftEasenetRecipient({
      easetag: hubSearchEasenet.easetag,
      fullName: hubSearchEasenet.fullName,
      avatarUrl: hubSearchEasenet.avatarUrl,
      accountKind: hubSearchEasenet.accountKind,
    })
  }, [hubSearchEasenet])

  const pickerRecipients = useMemo(() => {
    if (!hubVirtualRecipient) return hubDisplayRecipients
    return [hubVirtualRecipient, ...hubDisplayRecipients]
  }, [hubVirtualRecipient, hubDisplayRecipients])

  const handleSelect = useCallback(
    (recipient: Recipient) => {
      haptics.tap()
      onSelect(recipient)
      onClose()
    },
    [onClose, onSelect],
  )

  const handleAddNew = useCallback(() => {
    haptics.tap()
    onClose()
    navigation.navigate(
      'SelectRecentRecipient' as never,
      {
        preferredBalanceCurrency,
      } as never,
    )
  }, [navigation, onClose, preferredBalanceCurrency])

  return (
    <WebAwareModal visible={visible} onRequestClose={onClose} compact webPanelStyle={{ maxWidth: 480 }}>
      <Text style={styles.title}>Select recipient</Text>
      <Text style={styles.subtitle}>Choose a saved recipient or add a new one</Text>

      <View style={styles.searchWrap}>
        <Search size={16} color={colors.text.secondary} strokeWidth={2} style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search @easetag or recipients"
          placeholderTextColor={colors.text.secondary}
          value={searchTerm}
          onChangeText={setSearchTerm}
          autoCapitalize="none"
          autoCorrect={false}
        />
        {searchTerm.trim().startsWith('@') && hubSearchLoading ? (
          <ActivityIndicator size="small" color={colors.text.secondary} style={styles.searchSpinner} />
        ) : null}
      </View>

      {searchTerm.trim().startsWith('@') && hubSearchError && !hubSearchLoading ? (
        <Text style={styles.hubError}>{hubSearchError}</Text>
      ) : null}

      <ScrollView style={styles.list} keyboardShouldPersistTaps="handled">
        {pickerRecipients.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>{searchTerm.trim() ? 'No matches' : 'No recipients yet'}</Text>
            <Text style={styles.emptyHint}>
              {searchTerm.trim() ? 'Try another search' : 'Add a recipient to send money'}
            </Text>
          </View>
        ) : (
          pickerRecipients.map((recipient) => (
            <Pressable
              key={recipient.id}
              android_ripple={ripple.neutral}
              style={styles.row}
              onPress={() => handleSelect(recipient)}
            >
              <SendSelectedRecipientSummary recipient={recipient} />
            </Pressable>
          ))
        )}
      </ScrollView>

      <Pressable android_ripple={ripple.neutral} style={styles.addButton} onPress={handleAddNew}>
        <Plus size={18} color={colors.text.primary} strokeWidth={2} />
        <Text style={styles.addButtonText}>Add new recipient</Text>
      </Pressable>
    </WebAwareModal>
  )
}

const styles = StyleSheet.create({
  title: {
    ...textStyles.titleMedium,
    color: colors.text.primary,
    fontFamily: fontFamily.semibold,
    marginBottom: spacing[1],
  },
  subtitle: {
    ...textStyles.bodySmall,
    color: colors.text.secondary,
    marginBottom: spacing[4],
  },
  searchWrap: {
    ...searchFieldWrapperStyle(colors),
    marginBottom: spacing[3],
  },
  searchIcon: {
    marginRight: spacing[2],
  },
  searchInput: {
    ...searchFieldInputStyle(colors),
    flex: 1,
  },
  searchSpinner: {
    marginLeft: spacing[2],
  },
  hubError: {
    ...textStyles.bodySmall,
    color: colors.semantic.destructive,
    marginBottom: spacing[2],
  },
  list: {
    maxHeight: 280,
    marginBottom: spacing[3],
  },
  row: {
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    marginBottom: spacing[1],
  },
  empty: {
    paddingVertical: spacing[6],
    alignItems: 'center',
    gap: spacing[1],
  },
  emptyTitle: {
    ...textStyles.bodyMedium,
    color: colors.text.secondary,
    fontFamily: fontFamily.medium,
  },
  emptyHint: {
    ...textStyles.bodySmall,
    color: colors.text.secondary,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[2],
    borderWidth: 1,
    borderColor: colors.semantic.border,
    borderRadius: borderRadius.lg,
    paddingVertical: spacing[3],
  },
  addButtonText: {
    ...textStyles.bodyMedium,
    color: colors.text.primary,
    fontFamily: fontFamily.medium,
  },
})

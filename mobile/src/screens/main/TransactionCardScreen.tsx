import React, { useState, useCallback } from 'react'
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TextInput,
  Keyboard,
  Platform,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import * as Haptics from 'expo-haptics'
import ScreenWrapper from '../../components/ScreenWrapper'
import { ShimmerLoader } from '../../components/premium'
import { NavigationProps } from '../../types'
import { colors, textStyles, borderRadius, spacing } from '../../theme'
import { noahService } from '../../lib/noahService'

type Row = {
  id: string
  name: string
  amount: number
  currency: string
  status: string
  createdLabel: string
}

function isCardLike(tx: Record<string, unknown>): boolean {
  const meta = tx.metadata as { noah?: Record<string, unknown> } | undefined
  const raw = meta?.noah ?? {}
  const st = String(raw.SourceType ?? raw.CardID ?? '').toLowerCase()
  return st.includes('card')
}

export default function TransactionCardScreen({ navigation }: NavigationProps) {
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [rows, setRows] = useState<Row[]>([])

  const load = useCallback(async () => {
    try {
      const raw = await noahService.listTransactions(50)
      const filtered = raw.filter((t) => isCardLike(t))
      const mapped: Row[] = filtered.map((t) => {
        const id = String(t.transaction_id ?? t.id ?? '')
        const amount = typeof t.amount === 'number' ? t.amount : parseFloat(String(t.amount ?? 0))
        const currency = String(t.currency ?? 'USD')
        const status = String(t.status ?? '')
        const created = String(t.created_at ?? t.noah_created_at ?? '')
        const d = created ? new Date(created) : new Date()
        const createdLabel = Number.isNaN(d.getTime()) ? '' : d.toLocaleString()
        return {
          id,
          name: String(t.name ?? 'Card'),
          amount,
          currency,
          status,
          createdLabel,
        }
      })
      setRows(mapped)
    } catch {
      setRows([])
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  React.useEffect(() => {
    load()
  }, [load])

  const onRefresh = async () => {
    setRefreshing(true)
    try {
      await load()
    } finally {
      setRefreshing(false)
    }
  }

  const formatAmount = (amount: number, currency: string) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency.length === 3 ? currency : 'USD',
    }).format(amount)
  }

  const q = searchTerm.trim().toLowerCase()
  const visible = q
    ? rows.filter((r) => r.name.toLowerCase().includes(q) || r.status.toLowerCase().includes(q))
    : rows

  return (
    <ScreenWrapper>
      <View style={styles.container}>
        <View style={styles.header}>
          <Ionicons
            name="arrow-back"
            size={24}
            color={colors.text.primary}
            onPress={async () => {
              await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
              navigation.goBack()
            }}
            accessibilityRole="button"
          />
          <View style={{ flex: 1, marginLeft: spacing[3] }}>
            <Text style={styles.title}>Card transactions</Text>
            <Text style={styles.sub}>Spend tied to Easner cards (when available)</Text>
          </View>
        </View>

        <View style={styles.searchWrap}>
          <Ionicons name="search" size={18} color={colors.primary.main} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search"
            placeholderTextColor={colors.text.secondary}
            value={searchTerm}
            onChangeText={setSearchTerm}
            returnKeyType="search"
            onSubmitEditing={() => Keyboard.dismiss()}
          />
        </View>

        <ScrollView
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary.main} />
          }
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {loading ? (
            <View style={{ gap: spacing[2] }}>
              {[1, 2, 3, 4].map((i) => (
                <ShimmerLoader key={i} width="100%" height={64} borderRadius={borderRadius.md} />
              ))}
            </View>
          ) : visible.length === 0 ? (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>No card transactions yet</Text>
              <Text style={styles.emptyBody}>
                Corporate cards are coming soon. When card spend exists, it will be listed here (Noah card
                source only).
              </Text>
            </View>
          ) : (
            visible.map((item, idx) => (
              <View
                key={item.id}
                style={[styles.row, idx === visible.length - 1 && styles.rowLast]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowName}>{item.name}</Text>
                  <Text style={styles.rowMeta}>
                    {item.createdLabel} · {item.status}
                  </Text>
                </View>
                <Text style={styles.rowAmt}>{formatAmount(item.amount, item.currency)}</Text>
              </View>
            ))
          )}
        </ScrollView>
      </View>
    </ScreenWrapper>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background.primary,
    paddingHorizontal: spacing[5],
    paddingTop: spacing[4],
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing[4],
  },
  title: {
    ...textStyles.headlineSmall,
    color: colors.text.primary,
  },
  sub: {
    ...textStyles.bodySmall,
    color: colors.text.secondary,
    marginTop: 2,
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.frame.background,
    borderRadius: borderRadius.xl,
    paddingHorizontal: spacing[4],
    ...Platform.select({
      ios: { paddingVertical: spacing[3] },
      android: { paddingVertical: spacing[2], minHeight: 44 },
    }),
    gap: spacing[2],
    borderWidth: 0.5,
    borderColor: colors.frame.border,
    marginBottom: spacing[4],
  },
  searchInput: {
    flex: 1,
    ...textStyles.textInputMedium,
    color: colors.text.primary,
    ...Platform.select({
      ios: { paddingVertical: 0 },
      android: {
        paddingVertical: 0,
        includeFontPadding: false,
      },
    }),
  },
  scrollContent: {
    paddingBottom: spacing[10],
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing[4],
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border.light,
  },
  rowLast: {
    borderBottomWidth: 0,
  },
  rowName: {
    ...textStyles.bodyMedium,
    color: colors.text.primary,
    fontFamily: 'Outfit-Medium',
  },
  rowMeta: {
    ...textStyles.bodySmall,
    color: colors.text.secondary,
    marginTop: 2,
  },
  rowAmt: {
    ...textStyles.bodyMedium,
    color: colors.text.primary,
    fontFamily: 'Outfit-SemiBold',
  },
  empty: {
    paddingVertical: spacing[8],
    paddingHorizontal: spacing[2],
  },
  emptyTitle: {
    ...textStyles.titleMedium,
    color: colors.text.primary,
    marginBottom: spacing[2],
  },
  emptyBody: {
    ...textStyles.bodyMedium,
    color: colors.text.secondary,
    lineHeight: 22,
  },
})

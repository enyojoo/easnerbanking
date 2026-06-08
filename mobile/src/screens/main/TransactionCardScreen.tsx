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
  Pressable,
} from 'react-native'
import { ArrowLeft, CreditCard, Search } from 'lucide-react-native'
import ScreenWrapper from '../../components/ScreenWrapper'
import { PlainTwoColumnRowSkeleton } from '../../components/skeletons'
import EmptyState from '../../components/EmptyState'
import { NavigationProps } from '../../types'
import {
  colors,
  surfaceFrameStyle,
  surfaceChromeCircleStyle,
  textStyles,
  borderRadius,
  spacing,
  fontFamily,
  searchFieldWrapperStyle,
  searchFieldInputStyle,
} from '../../theme'
import { noahService } from '../../lib/noahService'
import { haptics } from '../../lib/haptics'

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
          <Pressable
            onPress={async () => {
              haptics.tap()
              navigation.goBack()
            }}
            accessibilityRole="button"
            hitSlop={12}
          >
            <ArrowLeft size={24} color={colors.primary.main} strokeWidth={2} />
          </Pressable>
          <View style={{ flex: 1, marginLeft: spacing[3] }}>
            <Text style={styles.title}>Card transactions</Text>
            <Text style={styles.sub}>Spend tied to Easner cards (when available)</Text>
          </View>
        </View>

        <View style={styles.searchWrap}>
          <Search size={18} color={colors.primary.main} strokeWidth={2} />
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
            <View style={{ gap: 0 }}>
              {[0, 1, 2, 3].map((i) => (
                <PlainTwoColumnRowSkeleton key={i} showDivider={i < 3} />
              ))}
            </View>
          ) : visible.length === 0 ? (
            <EmptyState
              icon={CreditCard}
              title="No card transactions yet"
              message="Corporate cards are coming soon. When card spend exists, it will be listed here (Noah card source only)."
            />
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
    ...surfaceFrameStyle(colors, { shadow: 'none', radius: borderRadius.full }),
    paddingHorizontal: spacing[4],
    ...searchFieldWrapperStyle,
    gap: spacing[2],
    marginBottom: spacing[4],
  },
  searchInput: {
    ...searchFieldInputStyle,
    color: colors.text.primary,
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
    fontFamily: fontFamily.medium,
  },
  rowMeta: {
    ...textStyles.bodySmall,
    color: colors.text.secondary,
    marginTop: 2,
  },
  rowAmt: {
    ...textStyles.bodyMedium,
    color: colors.text.primary,
    fontFamily: fontFamily.semibold,
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

import React, { useCallback, useEffect, useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import * as Haptics from 'expo-haptics'
import { ArrowDownLeft, ArrowUpRight } from 'lucide-react-native'
import ScreenWrapper from '../../components/ScreenWrapper'
import { NavigationProps } from '../../types'
import { colors, textStyles, borderRadius, spacing } from '../../theme'
import { noahService } from '../../lib/noahService'

function AnalyticsContent({ navigation }: NavigationProps) {
  const insets = useSafeAreaInsets()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [income, setIncome] = useState(0)
  const [expenses, setExpenses] = useState(0)
  const [count, setCount] = useState(0)
  const [primaryCurrency, setPrimaryCurrency] = useState('USD')

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const rows = await noahService.listTransactions(100)
      let inc = 0
      let exp = 0
      const curCounts: Record<string, number> = {}
      for (const r of rows) {
        const t = String(r.transaction_type ?? r.type ?? '')
        const amt = typeof r.amount === 'number' ? r.amount : parseFloat(String(r.amount ?? 0))
        const c = String(r.currency ?? 'USD')
        curCounts[c] = (curCounts[c] ?? 0) + 1
        if (t === 'receive') {
          inc += Math.abs(amt)
        } else {
          exp += Math.abs(amt)
        }
      }
      const topCurrency =
        Object.entries(curCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'USD'
      setPrimaryCurrency(topCurrency)
      setIncome(inc)
      setExpenses(exp)
      setCount(rows.length)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load activity')
      setIncome(0)
      setExpenses(0)
      setCount(0)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const formatCurrency = (amount: number, currency: string = primaryCurrency) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency.length === 3 ? currency : 'USD',
      minimumFractionDigits: 2,
    }).format(amount)
  }

  const renderCard = (type: 'income' | 'expenses') => {
    const isIncome = type === 'income'
    const val = isIncome ? income : expenses
    const Icon = isIncome ? ArrowDownLeft : ArrowUpRight
    const iconColor = isIncome ? '#10b981' : '#ef4444'
    const bgColor = isIncome ? '#d1fae5' : '#fee2e2'

    return (
      <View style={styles.card}>
        <View style={styles.cardContent}>
          <View style={styles.cardLeft}>
            <View style={[styles.cardIconContainer, { backgroundColor: bgColor }]}>
              <Icon size={24} color={iconColor} strokeWidth={2} />
            </View>
            <Text style={styles.cardLabel}>{isIncome ? 'Money in' : 'Money out'}</Text>
          </View>
          <Text style={styles.cardAmount}>
            {isIncome ? '' : '−'}
            {formatCurrency(val)}
          </Text>
        </View>
      </View>
    )
  }

  return (
    <ScreenWrapper>
      <View style={styles.container}>
        <ScrollView
          style={styles.scrollContainer}
          contentContainerStyle={{ paddingBottom: insets.bottom + spacing[5] }}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.header}>
            <TouchableOpacity
              onPress={async () => {
                await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
                navigation.goBack()
              }}
              style={styles.backButton}
              activeOpacity={0.7}
            >
              <Ionicons name="arrow-back" size={24} color={colors.text.primary} />
            </TouchableOpacity>
            <View style={styles.headerContent}>
              <Text style={styles.title}>Expense insights</Text>
              <Text style={styles.dateRange}>Totals from your Noah-linked activity</Text>
            </View>
          </View>

          {loading ? (
            <View style={styles.loading}>
              <ActivityIndicator size="large" color={colors.primary.main} />
            </View>
          ) : error ? (
            <View style={styles.honestEmpty}>
              <Text style={styles.honestTitle}>Insights unavailable</Text>
              <Text style={styles.honestBody}>{error}</Text>
            </View>
          ) : (
            <>
              <View style={styles.cardContainer}>
                {renderCard('income')}
                <View style={{ height: spacing[3] }} />
                {renderCard('expenses')}
              </View>

              <View style={styles.honestEmpty}>
                <Text style={styles.honestTitle}>Categories</Text>
                <Text style={styles.honestBody}>
                  Merchant categories are not available from this activity feed yet. {count} transaction
                  {count === 1 ? '' : 's'} in the current view.
                </Text>
              </View>
            </>
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
  },
  scrollContainer: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing[5],
    paddingTop: spacing[4],
    paddingBottom: spacing[4],
    gap: spacing[3],
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.frame.background,
    borderWidth: 0.5,
    borderColor: colors.frame.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerContent: {
    flex: 1,
  },
  title: {
    ...textStyles.headlineLarge,
    color: colors.text.primary,
    marginBottom: spacing[1],
  },
  dateRange: {
    ...textStyles.bodyMedium,
    color: colors.text.secondary,
  },
  loading: {
    paddingVertical: spacing[10],
    alignItems: 'center',
  },
  cardContainer: {
    paddingHorizontal: spacing[5],
    marginBottom: spacing[4],
  },
  card: {
    backgroundColor: '#F9F9F9',
    borderRadius: 24,
    borderWidth: 0.5,
    borderColor: '#E2E2E2',
    padding: spacing[5],
    width: '100%',
  },
  cardContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
  },
  cardIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardLabel: {
    ...textStyles.bodyMedium,
    color: colors.text.primary,
    fontWeight: '500',
  },
  cardAmount: {
    ...textStyles.headlineMedium,
    color: colors.text.primary,
    fontFamily: 'Outfit-SemiBold',
  },
  honestEmpty: {
    marginHorizontal: spacing[5],
    padding: spacing[5],
    backgroundColor: colors.frame.background,
    borderRadius: borderRadius.lg,
    borderWidth: 0.5,
    borderColor: colors.frame.border,
  },
  honestTitle: {
    ...textStyles.titleMedium,
    color: colors.text.primary,
    marginBottom: spacing[2],
  },
  honestBody: {
    ...textStyles.bodyMedium,
    color: colors.text.secondary,
    lineHeight: 22,
  },
})

export default function AnalyticsScreen(props: NavigationProps) {
  return <AnalyticsContent {...props} />
}

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  StyleSheet,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import ScreenWrapper from '../../components/ScreenWrapper'
import { NavigationProps } from '../../types'
import { noahService } from '../../lib/noahService'
import { colors, textStyles, borderRadius, spacing } from '../../theme'

export default function MoveFundsScreen({ navigation, route }: NavigationProps) {
  const fromCurrency = (((route.params as { fromCurrency?: string })?.fromCurrency || 'USD') as string).toUpperCase() as
    | 'USD'
    | 'EUR'

  const destinations = useMemo(() => {
    const other: ('USD' | 'EUR')[] = []
    if (fromCurrency !== 'USD') other.push('USD')
    if (fromCurrency !== 'EUR') other.push('EUR')
    return other
  }, [fromCurrency])

  const [toCurrency, setToCurrency] = useState<'USD' | 'EUR'>(destinations[0] ?? 'EUR')
  const [amountStr, setAmountStr] = useState('')
  const [quoteLoading, setQuoteLoading] = useState(false)
  const [moveLoading, setMoveLoading] = useState(false)
  const [destAmount, setDestAmount] = useState<string | null>(null)
  const [rate, setRate] = useState<string | null>(null)
  const [quoteError, setQuoteError] = useState<string | null>(null)

  useEffect(() => {
    if (!destinations.includes(toCurrency)) {
      setToCurrency(destinations[0] ?? 'EUR')
    }
  }, [destinations, toCurrency])

  const amountNum = parseFloat(amountStr.replace(/,/g, '')) || 0

  const loadQuote = useCallback(async () => {
    if (amountNum <= 0 || !toCurrency) {
      setDestAmount(null)
      setRate(null)
      setQuoteError(null)
      return
    }
    setQuoteLoading(true)
    setQuoteError(null)
    try {
      const q = await noahService.getFxQuote({
        sourceCurrency: fromCurrency,
        destinationCurrency: toCurrency,
        sourceAmount: String(amountNum),
      })
      setDestAmount(q.destinationAmount ?? null)
      setRate(q.impliedRate != null ? q.impliedRate.toFixed(6) : null)
    } catch (e: unknown) {
      setDestAmount(null)
      setRate(null)
      setQuoteError(e instanceof Error ? e.message : 'Quote failed')
    } finally {
      setQuoteLoading(false)
    }
  }, [amountNum, fromCurrency, toCurrency])

  useEffect(() => {
    const t = setTimeout(() => {
      void loadQuote()
    }, 450)
    return () => clearTimeout(t)
  }, [loadQuote])

  const onMove = async () => {
    if (amountNum <= 0) {
      Alert.alert('Amount required', 'Enter an amount to move.')
      return
    }
    setMoveLoading(true)
    try {
      const res = await noahService.postFxConvert({
        sourceCurrency: fromCurrency,
        destinationCurrency: toCurrency,
        sourceAmount: String(amountNum),
      })
      if (res.error) {
        Alert.alert('Move unavailable', res.error)
        return
      }
      Alert.alert('Success', 'Your move was submitted.')
      navigation.goBack()
    } catch (e: unknown) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Move failed')
    } finally {
      setMoveLoading(false)
    }
  }

  return (
    <ScreenWrapper>
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={colors.text.primary} />
          </TouchableOpacity>
          <Text style={styles.title}>Move funds</Text>
        </View>

        <Text style={styles.sub}>
          Convert between USD and EUR balances (stablecoin-backed). Quotes use Noah live rates.
        </Text>

        <Text style={styles.label}>From</Text>
        <Text style={styles.currencyBadge}>{fromCurrency}</Text>

        <Text style={styles.label}>Amount</Text>
        <TextInput
          style={styles.input}
          keyboardType="decimal-pad"
          placeholder="0.00"
          value={amountStr}
          onChangeText={setAmountStr}
        />

        <Text style={styles.label}>To</Text>
        <View style={styles.row}>
          {destinations.map((d) => (
            <TouchableOpacity
              key={d}
              style={[styles.pill, toCurrency === d && styles.pillActive]}
              onPress={() => setToCurrency(d)}
            >
              <Text style={[styles.pillText, toCurrency === d && styles.pillTextActive]}>{d}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.quoteBox}>
          {quoteLoading ? (
            <View style={styles.quoteRow}>
              <ActivityIndicator color={colors.primary.main} />
              <Text style={styles.quoteMuted}> Getting quote…</Text>
            </View>
          ) : (
            <>
              {rate ? (
                <Text style={styles.quoteLine}>
                  1 {fromCurrency} ≈ {rate} {toCurrency}
                </Text>
              ) : null}
              <Text style={styles.quoteMuted}>Estimated receive</Text>
              <Text style={styles.quoteBig}>
                {destAmount
                  ? `${toCurrency === 'USD' ? '$' : '€'}${parseFloat(destAmount).toLocaleString('en-US', {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}`
                  : '—'}
              </Text>
              {quoteError ? <Text style={styles.error}>{quoteError}</Text> : null}
            </>
          )}
        </View>

        <TouchableOpacity
          style={[styles.primaryBtn, (amountNum <= 0 || moveLoading) && styles.primaryBtnDisabled]}
          disabled={amountNum <= 0 || moveLoading}
          onPress={() => void onMove()}
        >
          {moveLoading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.primaryBtnText}>Move</Text>
          )}
        </TouchableOpacity>
      </View>
    </ScreenWrapper>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: spacing[6],
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing[4],
  },
  backButton: {
    marginRight: spacing[4],
  },
  title: {
    ...textStyles.headlineLarge,
    color: colors.text.primary,
  },
  sub: {
    ...textStyles.bodyLarge,
    color: colors.text.secondary,
    marginBottom: spacing[6],
  },
  label: {
    ...textStyles.labelMedium,
    color: colors.text.secondary,
    marginBottom: spacing[2],
    marginTop: spacing[3],
  },
  currencyBadge: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text.primary,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.neutral[200],
    borderRadius: borderRadius.md,
    padding: spacing[4],
    fontSize: 20,
    color: colors.text.primary,
  },
  row: {
    flexDirection: 'row',
    gap: spacing[3],
  },
  pill: {
    paddingVertical: spacing[3],
    paddingHorizontal: spacing[6],
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: colors.neutral[200],
  },
  pillActive: {
    backgroundColor: colors.primary.main,
    borderColor: colors.primary.main,
  },
  pillText: {
    color: colors.text.primary,
    fontWeight: '600',
  },
  pillTextActive: {
    color: '#fff',
  },
  quoteBox: {
    marginTop: spacing[6],
    padding: spacing[6],
    borderRadius: borderRadius.lg,
    backgroundColor: colors.background.secondary,
  },
  quoteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
  },
  quoteLine: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text.primary,
    marginBottom: spacing[3],
  },
  quoteMuted: {
    fontSize: 13,
    color: colors.text.secondary,
  },
  quoteBig: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.text.primary,
    marginTop: spacing[2],
  },
  error: {
    marginTop: spacing[3],
    color: colors.error.main,
    fontSize: 13,
  },
  primaryBtn: {
    marginTop: spacing[8],
    backgroundColor: colors.primary.main,
    paddingVertical: spacing[4],
    borderRadius: borderRadius.md,
    alignItems: 'center',
  },
  primaryBtnDisabled: {
    opacity: 0.5,
  },
  primaryBtnText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '600',
  },
})

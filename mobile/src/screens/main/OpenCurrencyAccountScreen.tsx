import React, { useCallback, useEffect, useState } from 'react'
import { View, Text, StyleSheet, Pressable, ActivityIndicator, FlatList } from 'react-native'
import { ArrowLeft } from 'lucide-react-native'
import ScreenWrapper from '../../components/ScreenWrapper'
import { NavigationProps } from '../../types'
import { apiGet, apiPost } from '../../lib/apiClient'
import { colors, surfaceFrameStyle, surfaceChromeCircleStyle, textStyles, spacing, borderRadius, fontFamily } from '../../theme'
import { ripple } from '../../lib/androidRipple'
import { haptics } from '../../lib/haptics'

type Offer = {
  code: string
  label: string
  alreadyAdded: boolean
  disabledReason?: string
  tierRequired: number
}

export default function OpenCurrencyAccountScreen({ navigation }: NavigationProps) {
  const [loading, setLoading] = useState(true)
  const [busyCode, setBusyCode] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [offers, setOffers] = useState<Offer[]>([])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await apiGet('/api/accounts/available-currencies')
      const json = await response.json().catch(() => ({}))
      if (!response.ok) {
        setError((json as any).error || 'Unable to load currencies.')
        return
      }
      setOffers((json as any).offers || [])
    } catch (e: any) {
      setError(e?.message || 'Unable to load currencies.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const openCurrency = async (code: string) => {
    setBusyCode(code)
    setError(null)
    try {
      haptics.tap()
      const response = await apiPost('/api/accounts/open-currency', { currency: code })
      const json = await response.json().catch(() => ({}))
      if (!response.ok) {
        setError((json as any).error || `Unable to open ${code}.`)
        return
      }
      navigation.goBack()
    } catch (e: any) {
      setError(e?.message || `Unable to open ${code}.`)
    } finally {
      setBusyCode(null)
    }
  }

  return (
    <ScreenWrapper>
      <View style={styles.container}>
        <View style={styles.header}>
          <Pressable
            android_ripple={ripple.neutral}
            onPress={() => {
              haptics.tap()
              navigation.goBack()
            }}
            style={styles.backButton}
          >
            <ArrowLeft size={24} color={colors.primary.main} strokeWidth={2} />
          </Pressable>
          <View style={styles.headerContent}>
            <Text style={styles.title}>Open Currency Account</Text>
          </View>
        </View>

        {error ? <Text style={[styles.error, styles.errorPad]}>{error}</Text> : null}

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator size="small" color={colors.primary.main} />
          </View>
        ) : (
          <FlatList
            data={offers}
            keyExtractor={(item) => item.code}
            contentContainerStyle={styles.list}
            renderItem={({ item }) => {
              const disabled = item.alreadyAdded || Boolean(item.disabledReason) || busyCode !== null
              return (
                <View style={styles.item}>
                  <View style={styles.itemTextWrap}>
                    <Text style={styles.itemTitle}>{item.code} - {item.label}</Text>
                    <Text style={styles.itemSubtitle}>
                      {item.disabledReason || (item.alreadyAdded ? 'Already added' : `Tier ${item.tierRequired}`)}
                    </Text>
                  </View>
                  <Pressable
                   android_ripple={ripple.neutral}
                    disabled={disabled}
                    style={[styles.addBtn, disabled && styles.addBtnDisabled]}
                    onPress={() => openCurrency(item.code)}
                  >
                    {busyCode === item.code ? (
                      <ActivityIndicator size="small" color={colors.text.inverse} />
                    ) : (
                      <Text style={styles.addBtnText}>{item.alreadyAdded ? 'Added' : 'Add'}</Text>
                    )}
                  </Pressable>
                </View>
              )
            }}
          />
        )}
      </View>
    </ScreenWrapper>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background.primary },
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
  },
  title: { ...textStyles.headlineMedium, color: colors.text.primary },
  error: { ...textStyles.bodySmall, color: colors.error.main },
  errorPad: { paddingHorizontal: spacing[5], marginBottom: spacing[3] },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { gap: spacing[3], paddingBottom: spacing[8], paddingHorizontal: spacing[5] },
  item: {
    ...surfaceFrameStyle(colors, { shadow: 'none', radius: borderRadius.lg }),
    padding: spacing[3],
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  itemTextWrap: { flex: 1 },
  itemTitle: { ...textStyles.bodyMedium, color: colors.text.primary, fontFamily: fontFamily.semibold },
  itemSubtitle: { ...textStyles.bodySmall, color: colors.text.secondary },
  addBtn: {
    minWidth: 64,
    height: 34,
    borderRadius: borderRadius.full,
    backgroundColor: colors.primary.main,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing[3],
  },
  addBtnDisabled: { opacity: 0.5 },
  addBtnText: { ...textStyles.bodySmall, color: colors.text.inverse, fontFamily: fontFamily.semibold },
})


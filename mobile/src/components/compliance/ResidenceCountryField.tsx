import React, { useEffect, useMemo, useState } from 'react'
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  ActivityIndicator,
} from 'react-native'
import { ChevronDown, MapPin } from 'lucide-react-native'
import { filterCountriesByPolicy, sortByEasnerCountryPickerOrder } from '@easner/shared'
import { countryService, type Country } from '../../lib/countryService'
import { getAllowedCountriesCached } from '../../lib/jurisdictionCountryPolicy'
import { WebAwareModal } from '../WebAwareModal'
import { CountryFlag } from '../flags/CountryFlag'
import { colors, spacing, textStyles, borderRadius, fontSize } from '../../theme'
import { haptics } from '../../lib/haptics'

type Props = {
  value: string
  onChange: (iso2: string) => void
  label?: string
  helperText?: string
  disabled?: boolean
  error?: string | null
}

export function ResidenceCountryField({
  value,
  onChange,
  label = 'Country of residence',
  helperText = 'Where you live — used for identity verification and account eligibility.',
  disabled = false,
  error = null,
}: Props) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [countries, setCountries] = useState<Country[]>([])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      setLoading(true)
      try {
        const [all, policy] = await Promise.all([
          countryService.getAllIncludingUnsupported(),
          getAllowedCountriesCached('individual_residence'),
        ])
        const catalog = all.map((c) => ({ code: c.code, name: c.name }))
        const filtered = filterCountriesByPolicy(
          catalog,
          policy.unrestricted ? null : policy.codes,
        )
        const sorted = sortByEasnerCountryPickerOrder(filtered)
        const byCode = new Map(all.map((c) => [c.code, c]))
        const list = sorted
          .map((e) => byCode.get(e.code))
          .filter((c): c is Country => Boolean(c))
        if (!cancelled) setCountries(list)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const selected = useMemo(
    () => countries.find((c) => c.code === value) ?? null,
    [countries, value],
  )

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return countries
    return countries.filter(
      (c) => c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q),
    )
  }, [countries, search])

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      {helperText ? <Text style={styles.helper}>{helperText}</Text> : null}
      <Pressable
        style={[styles.trigger, disabled && styles.triggerDisabled, error ? styles.triggerError : null]}
        disabled={disabled || loading}
        onPress={() => {
          haptics.tap()
          setOpen(true)
        }}
      >
        {loading ? (
          <ActivityIndicator size="small" color={colors.primary.main} />
        ) : selected ? (
          <View style={styles.triggerInner}>
            <CountryFlag code={selected.code} size={22} />
            <Text style={styles.triggerText}>{selected.name}</Text>
          </View>
        ) : (
          <View style={styles.triggerInner}>
            <MapPin size={18} color={colors.semantic.mutedForeground} strokeWidth={2} />
            <Text style={styles.placeholder}>Select country of residence</Text>
          </View>
        )}
        <ChevronDown size={18} color={colors.semantic.mutedForeground} strokeWidth={2} />
      </Pressable>
      {error ? <Text style={styles.error}>{error}</Text> : null}

      <WebAwareModal
        visible={open}
        onRequestClose={() => {
          setOpen(false)
          setSearch('')
        }}
        keyboardAvoiding
      >
        <View style={styles.modalPanel}>
          <Text style={styles.modalTitle}>{label}</Text>
          <TextInput
            style={styles.search}
            placeholder="Search countries…"
            placeholderTextColor={colors.semantic.mutedForeground}
            value={search}
            onChangeText={setSearch}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <FlatList
            data={filtered}
            keyExtractor={(item) => item.code}
            keyboardShouldPersistTaps="handled"
            style={styles.list}
            ListEmptyComponent={
              <Text style={styles.empty}>{loading ? 'Loading…' : 'No countries found.'}</Text>
            }
            renderItem={({ item }) => (
              <Pressable
                style={styles.row}
                onPress={() => {
                  haptics.tap()
                  onChange(item.code)
                  setOpen(false)
                  setSearch('')
                }}
              >
                <CountryFlag code={item.code} size={22} />
                <Text style={styles.rowText}>{item.name}</Text>
              </Pressable>
            )}
          />
        </View>
      </WebAwareModal>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: spacing[3],
  },
  label: {
    ...textStyles.labelMedium,
    color: colors.text.primary,
    marginBottom: spacing[1],
  },
  helper: {
    ...textStyles.bodySmall,
    color: colors.text.secondary,
    marginBottom: spacing[2],
  },
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: colors.frame.border,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[3],
    backgroundColor: colors.background.primary,
    minHeight: 48,
  },
  triggerDisabled: {
    opacity: 0.6,
  },
  triggerError: {
    borderColor: colors.error.main,
  },
  triggerInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    flex: 1,
  },
  triggerText: {
    ...textStyles.bodyMedium,
    color: colors.text.primary,
    flexShrink: 1,
  },
  placeholder: {
    ...textStyles.bodyMedium,
    color: colors.semantic.mutedForeground,
  },
  error: {
    ...textStyles.bodySmall,
    color: colors.error.main,
    marginTop: spacing[1],
  },
  modalPanel: {
    padding: spacing[4],
    maxHeight: '80%',
  },
  modalTitle: {
    ...textStyles.headlineSmall,
    color: colors.text.primary,
    marginBottom: spacing[3],
  },
  search: {
    borderWidth: 1,
    borderColor: colors.frame.border,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    marginBottom: spacing[3],
    fontSize: fontSize.sm,
    color: colors.text.primary,
  },
  list: {
    maxHeight: 320,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    paddingVertical: spacing[3],
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.frame.border,
  },
  rowText: {
    ...textStyles.bodyMedium,
    color: colors.text.primary,
    flex: 1,
  },
  empty: {
    ...textStyles.bodySmall,
    color: colors.text.secondary,
    textAlign: 'center',
    paddingVertical: spacing[4],
  },
})

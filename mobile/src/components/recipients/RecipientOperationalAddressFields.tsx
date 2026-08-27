import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  findNodeHandle,
  type ScrollView,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native'
import { Check, ChevronDown, ChevronUp, Search } from 'lucide-react-native'
import {
  ensureOperationalAddressCountryRegistered,
  getOperationalAddressFormConfig,
  listSubdivisions,
  sanitizeSubdivisionForCountry,
  type OperationalAddressFormConfig,
} from '@easner/shared/postal-address-form'
import RecipientFormDropdownList from './RecipientFormDropdownList'
import { RegisterRecipientDropdownSheet } from './RecipientFormDropdownHost'
import {
  colors,
  spacing,
  textStyles,
  borderRadius,
  fontFamily,
  surfaceFrameStyle,
  dropdownSearchRowStyle,
  dropdownSearchInputStyle,
  compactFormInputStyle,
} from '../../theme'
import { ripple } from '../../lib/androidRipple'
import { haptics } from '../../lib/haptics'

export type RecipientOperationalAddressValues = {
  addressLine1: string
  city: string
  state: string
  postalCode: string
}

type Props = {
  countryCode: string
  values: RecipientOperationalAddressValues
  onChange: (patch: Partial<RecipientOperationalAddressValues>) => void
  isSubmitting?: boolean
  scrollRef: React.RefObject<ScrollView | null>
  inputStyle: StyleProp<TextStyle>
  rowStyle?: StyleProp<ViewStyle>
  halfInputStyle?: StyleProp<ViewStyle>
  showSubdivisionDropdown: boolean
  onToggleSubdivisionDropdown: () => void
  subdivisionSearchTerm: string
  onSubdivisionSearchTermChange: (term: string) => void
  onCloseSubdivisionDropdown: () => void
}

function scrollFieldIntoView(
  scrollRef: React.RefObject<ScrollView | null>,
  hostRef: React.RefObject<View | null>,
) {
  const scroll = scrollRef.current
  const host = hostRef.current
  if (!scroll || !host) return
  requestAnimationFrame(() => {
    const scrollNode = findNodeHandle(scroll)
    if (!scrollNode) return
    host.measureLayout(
      scrollNode,
      (_x, y) => {
        scroll.scrollTo({ y: Math.max(0, y - 24), animated: true })
      },
      () => {},
    )
  })
}

function FieldInput({
  scrollRef,
  ...props
}: React.ComponentProps<typeof TextInput> & {
  scrollRef: React.RefObject<ScrollView | null>
}) {
  const hostRef = useRef<View>(null)
  return (
    <View ref={hostRef} collapsable={false}>
      <TextInput
        {...props}
        onFocus={(e) => {
          props.onFocus?.(e)
          scrollFieldIntoView(scrollRef, hostRef)
        }}
      />
    </View>
  )
}

/** Holder address using KYB field config; country is locked to the payout corridor. */
export function RecipientOperationalAddressFields({
  countryCode,
  values,
  onChange,
  isSubmitting,
  scrollRef,
  inputStyle,
  rowStyle,
  halfInputStyle,
  showSubdivisionDropdown,
  onToggleSubdivisionDropdown,
  subdivisionSearchTerm,
  onSubdivisionSearchTermChange,
  onCloseSubdivisionDropdown,
}: Props) {
  const [countryReady, setCountryReady] = useState(false)

  useEffect(() => {
    let cancelled = false
    const code = countryCode.trim().toUpperCase()
    if (!/^[A-Z]{2}$/.test(code)) {
      setCountryReady(false)
      return
    }
    setCountryReady(false)
    void ensureOperationalAddressCountryRegistered(code)
      .catch(() => undefined)
      .then(() => {
        if (!cancelled) setCountryReady(true)
      })
    return () => {
      cancelled = true
    }
  }, [countryCode])

  const config: OperationalAddressFormConfig = useMemo(
    () => getOperationalAddressFormConfig(countryCode),
    [countryCode, countryReady],
  )

  const subdivisions = useMemo(() => {
    if (!countryReady) return []
    return listSubdivisions(countryCode)
  }, [countryCode, countryReady])

  useEffect(() => {
    if (!countryReady) return
    const next = sanitizeSubdivisionForCountry(countryCode, values.state)
    if (next !== values.state) onChange({ state: next })
  }, [countryCode, countryReady, onChange, values.state])

  const selectedSubdivision = subdivisions.find((row) => row.value === values.state)
  const filteredSubdivisions = useMemo(() => {
    const q = subdivisionSearchTerm.trim().toLowerCase()
    if (!q) return subdivisions
    return subdivisions.filter(
      (row) => row.label.toLowerCase().includes(q) || row.value.toLowerCase().includes(q),
    )
  }, [subdivisions, subdivisionSearchTerm])

  const closeSubdivision = () => {
    onCloseSubdivisionDropdown()
    onSubdivisionSearchTermChange('')
  }

  const streetPlaceholder = `${config.line1.label}${config.line1.required ? ' *' : ''}`
  const cityPlaceholder = `${config.city.label}${config.city.required ? ' *' : ''}`
  const statePlaceholder = `${config.subdivision.label}${config.subdivision.required ? ' *' : ''}`
  const postalPlaceholder = config.postal.examples[0]
    ? `${config.postal.label}${config.postal.required ? ' *' : ''} (${config.postal.examples[0]})`
    : `${config.postal.label}${config.postal.required ? ' *' : ''}`

  return (
    <>
      {config.line1.visible ? (
        <FieldInput
          scrollRef={scrollRef}
          style={inputStyle}
          value={values.addressLine1}
          onChangeText={(text) => onChange({ addressLine1: text })}
          placeholder={streetPlaceholder}
          placeholderTextColor={colors.text.secondary}
          autoCapitalize="words"
          editable={!isSubmitting}
        />
      ) : null}
      {config.city.visible ? (
        <FieldInput
          scrollRef={scrollRef}
          style={inputStyle}
          value={values.city}
          onChangeText={(text) => onChange({ city: text })}
          placeholder={cityPlaceholder}
          placeholderTextColor={colors.text.secondary}
          autoCapitalize="words"
          editable={!isSubmitting}
        />
      ) : null}
      {config.subdivision.visible || config.postal.visible ? (
        <View style={[styles.row, rowStyle]}>
          {config.subdivision.visible ? (
            <View style={[styles.half, halfInputStyle]}>
              {config.subdivision.mode === 'dropdown' ? (
                <View>
                  <Pressable
                    android_ripple={ripple.neutral}
                    style={styles.selector}
                    onPress={() => {
                      if (isSubmitting) return
                      onToggleSubdivisionDropdown()
                    }}
                    disabled={isSubmitting}
                  >
                    <Text
                      style={selectedSubdivision || values.state ? styles.valueText : styles.placeholderText}
                      numberOfLines={1}
                    >
                      {selectedSubdivision?.label ??
                        (values.state ? values.state : statePlaceholder)}
                    </Text>
                    {showSubdivisionDropdown ? (
                      <ChevronUp size={16} color={colors.brand.slate} strokeWidth={2} />
                    ) : (
                      <ChevronDown size={16} color={colors.brand.slate} strokeWidth={2} />
                    )}
                  </Pressable>
                  <RegisterRecipientDropdownSheet visible={showSubdivisionDropdown} onClose={closeSubdivision}>
                    <View style={styles.searchRow}>
                      <Search size={18} color={colors.neutral[400]} strokeWidth={2} />
                      <TextInput
                        style={styles.searchInput}
                        placeholder={`Search ${config.subdivision.label.toLowerCase()}…`}
                        placeholderTextColor={colors.neutral[400]}
                        value={subdivisionSearchTerm}
                        onChangeText={onSubdivisionSearchTermChange}
                        autoCorrect={false}
                      />
                    </View>
                    <RecipientFormDropdownList>
                      {filteredSubdivisions.length === 0 ? (
                        <View style={styles.emptyRow}>
                          <Text style={styles.emptyText}>No match found</Text>
                        </View>
                      ) : (
                        filteredSubdivisions.map((row) => (
                          <Pressable
                            key={row.value}
                            android_ripple={ripple.neutral}
                            style={[styles.item, values.state === row.value && styles.itemSelected]}
                            onPress={() => {
                              haptics.tap()
                              onChange({ state: row.value })
                              closeSubdivision()
                            }}
                          >
                            <Text style={styles.itemLabel}>{row.label}</Text>
                            {values.state === row.value ? (
                              <Check size={18} color={colors.primary.main} strokeWidth={2.5} />
                            ) : null}
                          </Pressable>
                        ))
                      )}
                    </RecipientFormDropdownList>
                  </RegisterRecipientDropdownSheet>
                </View>
              ) : (
                <FieldInput
                  scrollRef={scrollRef}
                  style={inputStyle}
                  value={values.state}
                  onChangeText={(text) => onChange({ state: text })}
                  placeholder={statePlaceholder}
                  placeholderTextColor={colors.text.secondary}
                  autoCapitalize="words"
                  editable={!isSubmitting}
                />
              )}
            </View>
          ) : null}
          {config.postal.visible ? (
            <View style={[styles.half, halfInputStyle]}>
              <FieldInput
                scrollRef={scrollRef}
                style={inputStyle}
                value={values.postalCode}
                onChangeText={(text) => onChange({ postalCode: text })}
                placeholder={postalPlaceholder}
                placeholderTextColor={colors.text.secondary}
                autoCapitalize="characters"
                editable={!isSubmitting}
              />
            </View>
          ) : null}
        </View>
      ) : null}
    </>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 12 },
  half: { flex: 1, minWidth: 0 },
  selector: {
    ...surfaceFrameStyle(colors, { shadow: 'none', radius: borderRadius.full }),
    ...compactFormInputStyle,
    paddingHorizontal: spacing[4],
    borderWidth: 1.5,
    borderColor: colors.frame.border,
    backgroundColor: colors.frame.background,
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  valueText: {
    flex: 1,
    minWidth: 0,
    ...textStyles.bodyMedium,
    color: colors.text.primary,
    fontFamily: fontFamily.regular,
  },
  placeholderText: {
    flex: 1,
    minWidth: 0,
    ...textStyles.bodyMedium,
    color: colors.text.secondary,
    fontFamily: fontFamily.regular,
  },
  searchRow: {
    ...dropdownSearchRowStyle,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.light,
  },
  searchInput: {
    ...dropdownSearchInputStyle,
    color: colors.text.primary,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[3],
    gap: spacing[2],
  },
  itemSelected: {
    backgroundColor: colors.primary.main + '12',
  },
  itemLabel: {
    flex: 1,
    minWidth: 0,
    ...textStyles.bodyMedium,
    color: colors.text.primary,
    fontFamily: fontFamily.regular,
  },
  emptyRow: {
    padding: spacing[4],
    alignItems: 'center',
  },
  emptyText: {
    ...textStyles.bodySmall,
    color: colors.text.secondary,
  },
})

import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  FlatList,
  Keyboard,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
  type StyleProp,
  type ViewStyle,
} from 'react-native'
import { Check, ChevronDown, Info, MapPin, Search, X } from 'lucide-react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { RESIDENCE_COUNTRY_CATALOG } from '../../lib/residenceCountryCatalog'
import { filterNoahSupportedCountries } from '../../lib/noahSupportedCountries'
import { WebAwareModal } from '../WebAwareModal'
import { CountryFlag } from '../flags/CountryFlag'
import {
  colors,
  spacing,
  textStyles,
  borderRadius,
  dropdownSearchRowStyle,
  dropdownSearchInputStyle,
  surfaceFrameStyle,
} from '../../theme'
import { haptics } from '../../lib/haptics'

type Props = {
  value: string
  onChange: (iso2: string) => void
  label?: string
  helperText?: string
  /** Info affordance next to the label (tap to reveal), mirroring business signup. */
  tooltip?: string
  disabled?: boolean
  error?: string | null
  containerStyle?: StyleProp<ViewStyle>
}

type CountryRow = { code: string; name: string }

export function ResidenceCountryField({
  value,
  onChange,
  label = 'Country of residence',
  helperText,
  tooltip,
  disabled = false,
  error = null,
  containerStyle,
}: Props) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [tooltipOpen, setTooltipOpen] = useState(false)
  const [tipTop, setTipTop] = useState<number | null>(null)
  const [keyboardHeight, setKeyboardHeight] = useState(0)
  const infoRef = useRef<View>(null)
  const searchRef = useRef<TextInput>(null)
  const insets = useSafeAreaInsets()
  const { height: windowHeight } = useWindowDimensions()

  // Product hard-blocks only (Noah fully prohibited VA). Do not use the Business
  // Office allowlist API – that strips Grid-blocked countries (e.g. KE) and keeps
  // Mobile-blocked ones (e.g. GB).
  const countries = useMemo(
    () => filterNoahSupportedCountries(RESIDENCE_COUNTRY_CATALOG),
    [],
  )

  useEffect(() => {
    if (!tooltipOpen) return
    const id = setTimeout(() => setTooltipOpen(false), 4000)
    return () => clearTimeout(id)
  }, [tooltipOpen])

  useEffect(() => {
    if (!open) {
      setKeyboardHeight(0)
      return
    }
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow'
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide'
    const onShow = Keyboard.addListener(showEvent, (e) => {
      setKeyboardHeight(e.endCoordinates?.height ?? 0)
    })
    const onHide = Keyboard.addListener(hideEvent, () => setKeyboardHeight(0))
    return () => {
      onShow.remove()
      onHide.remove()
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const id = setTimeout(() => searchRef.current?.focus(), 120)
    return () => clearTimeout(id)
  }, [open])

  const toggleTooltip = () => {
    haptics.tap()
    if (tooltipOpen) {
      setTooltipOpen(false)
      return
    }
    const node = infoRef.current
    if (node && typeof node.measureInWindow === 'function') {
      node.measureInWindow((_x, y, _w, h) => {
        setTipTop(y + h + 6)
        setTooltipOpen(true)
      })
    } else {
      setTipTop(null)
      setTooltipOpen(true)
    }
  }

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

  const closePicker = () => {
    setOpen(false)
    setSearch('')
    Keyboard.dismiss()
  }

  const bottomPad = Math.max(insets.bottom, spacing[4])
  const topGap = insets.top + spacing[2]
  const preferredSheetHeight = Math.round(windowHeight * 0.72)
  const sheetHeight = Math.max(
    320,
    Math.min(preferredSheetHeight, windowHeight - topGap - keyboardHeight),
  )

  const renderCountry = ({ item }: { item: CountryRow }) => {
    const isSelected = item.code === value
    return (
      <Pressable
        style={[styles.row, isSelected && styles.rowSelected]}
        onPress={() => {
          haptics.tap()
          onChange(item.code)
          closePicker()
        }}
        accessibilityRole="button"
        accessibilityState={{ selected: isSelected }}
      >
        <CountryFlag code={item.code} size={22} />
        <View style={styles.rowTextWrap}>
          <Text style={styles.rowName}>{item.name}</Text>
          <Text style={styles.rowCode}>{item.code}</Text>
        </View>
        {isSelected ? (
          <Check size={18} color={colors.primary.main} strokeWidth={2.5} />
        ) : null}
      </Pressable>
    )
  }

  return (
    <View style={[styles.wrap, containerStyle]}>
      {label ? (
        <View style={styles.labelRow}>
          <Text style={styles.label}>{label}</Text>
          {tooltip ? (
            <Pressable
              ref={infoRef}
              onPress={toggleTooltip}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={`${label} info`}
            >
              <Info size={15} color={colors.semantic.mutedForeground} strokeWidth={2} />
            </Pressable>
          ) : null}
        </View>
      ) : null}
      {helperText ? <Text style={styles.helper}>{helperText}</Text> : null}
      <Pressable
        style={[styles.trigger, disabled && styles.triggerDisabled, error ? styles.triggerError : null]}
        disabled={disabled}
        onPress={() => {
          haptics.tap()
          setTooltipOpen(false)
          setOpen(true)
        }}
      >
        {selected ? (
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

      {tooltip ? (
        <Modal
          visible={tooltipOpen}
          transparent
          animationType="fade"
          onRequestClose={() => setTooltipOpen(false)}
        >
          <Pressable style={styles.tooltipOverlay} onPress={() => setTooltipOpen(false)}>
            <View
              pointerEvents="none"
              style={[styles.tooltipBubble, { top: tipTop ?? 120 }]}
            >
              <Text style={styles.tooltipText}>{tooltip}</Text>
            </View>
          </Pressable>
        </Modal>
      ) : null}

      <WebAwareModal
        visible={open}
        onRequestClose={closePicker}
        keyboardAvoiding
        nativePanelStyle={{ height: sheetHeight, maxHeight: sheetHeight }}
        webPanelStyle={{ height: sheetHeight, maxHeight: sheetHeight }}
      >
        <View style={[styles.modalPanel, { paddingBottom: bottomPad, height: sheetHeight }]}>
          {Platform.OS !== 'web' ? <View style={styles.grabber} /> : null}
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{label}</Text>
            <Pressable
              onPress={() => {
                haptics.tap()
                closePicker()
              }}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Close country list"
              style={styles.closeBtn}
            >
              <X size={20} color={colors.text.secondary} strokeWidth={2} />
            </Pressable>
          </View>
          <View style={styles.searchRow}>
            <Search size={18} color={colors.semantic.mutedForeground} strokeWidth={2} />
            <TextInput
              ref={searchRef}
              style={styles.searchInput}
              placeholder="Search countries…"
              placeholderTextColor={colors.semantic.mutedForeground}
              value={search}
              onChangeText={setSearch}
              autoCapitalize="none"
              autoCorrect={false}
              clearButtonMode="while-editing"
              returnKeyType="search"
              accessibilityLabel="Search countries"
            />
            {search.length > 0 && Platform.OS !== 'ios' ? (
              <Pressable
                onPress={() => setSearch('')}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Clear search"
              >
                <X size={16} color={colors.semantic.mutedForeground} strokeWidth={2} />
              </Pressable>
            ) : null}
          </View>
          <FlatList
            data={filtered}
            keyExtractor={(item) => item.code}
            renderItem={renderCountry}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            style={styles.list}
            contentContainerStyle={
              filtered.length === 0 ? styles.listEmptyContent : styles.listContent
            }
            showsVerticalScrollIndicator
            initialNumToRender={16}
            windowSize={8}
            ListEmptyComponent={
              <Text style={styles.empty}>No countries found.</Text>
            }
          />
        </View>
      </WebAwareModal>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: spacing[4],
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    marginBottom: spacing[2],
  },
  label: {
    ...textStyles.labelLarge,
    color: colors.semantic.foreground,
  },
  tooltipOverlay: {
    flex: 1,
  },
  tooltipBubble: {
    position: 'absolute',
    left: spacing[4],
    right: spacing[4],
    elevation: 8,
    backgroundColor: colors.semantic.card,
    borderWidth: 1,
    borderColor: colors.semantic.border,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
  },
  tooltipText: {
    ...textStyles.bodySmall,
    color: colors.text.secondary,
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
    borderColor: colors.semantic.border,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    backgroundColor: colors.semantic.background,
    minHeight: 52,
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
    ...textStyles.textInputSingleLine,
    color: colors.semantic.foreground,
    flexShrink: 1,
  },
  placeholder: {
    ...textStyles.textInputSingleLine,
    color: colors.semantic.mutedForeground,
  },
  error: {
    ...textStyles.bodySmall,
    color: colors.error.main,
    marginTop: spacing[1],
  },
  modalPanel: {
    paddingHorizontal: spacing[4],
    paddingTop: spacing[2],
  },
  grabber: {
    width: 40,
    height: 4,
    borderRadius: borderRadius.full,
    backgroundColor: colors.semantic.border,
    alignSelf: 'center',
    marginBottom: spacing[3],
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing[3],
    gap: spacing[3],
  },
  modalTitle: {
    ...textStyles.headlineSmall,
    color: colors.text.primary,
    flex: 1,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.semantic.muted,
  },
  searchRow: {
    ...dropdownSearchRowStyle,
    ...surfaceFrameStyle(colors, { shadow: 'none', radius: borderRadius.lg }),
    marginBottom: spacing[3],
  },
  searchInput: {
    ...dropdownSearchInputStyle,
    color: colors.text.primary,
  },
  list: {
    flex: 1,
    minHeight: 0,
  },
  listContent: {
    paddingBottom: spacing[2],
  },
  listEmptyContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingVertical: spacing[6],
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    paddingVertical: spacing[3],
    paddingHorizontal: spacing[2],
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.frame.border,
    minHeight: 52,
  },
  rowSelected: {
    backgroundColor: colors.semantic.muted,
    borderRadius: borderRadius.md,
    borderBottomWidth: 0,
    marginVertical: 2,
  },
  rowTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  rowName: {
    ...textStyles.bodyMedium,
    color: colors.text.primary,
  },
  rowCode: {
    ...textStyles.labelSmall,
    color: colors.text.secondary,
    marginTop: 2,
  },
  empty: {
    ...textStyles.bodySmall,
    color: colors.text.secondary,
    textAlign: 'center',
    paddingVertical: spacing[4],
  },
})

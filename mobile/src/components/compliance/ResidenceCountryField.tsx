import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native'
import { ChevronDown, Info, MapPin } from 'lucide-react-native'
import { filterResidenceCountryCatalog } from '../../lib/residenceCountryCatalog'
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
  /** Info affordance next to the label (tap to reveal), mirroring business signup. */
  tooltip?: string
  disabled?: boolean
  error?: string | null
  containerStyle?: StyleProp<ViewStyle>
}

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
  const infoRef = useRef<View>(null)

  // Allowlist policy is best-effort. `null` means "show everything", so the
  // list renders instantly from the local catalog and never blocks/spins on
  // the network; it only narrows once (and if) the policy resolves.
  const [allowedCodes, setAllowedCodes] = useState<string[] | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const policy = await getAllowedCountriesCached('individual_residence')
        if (!cancelled) setAllowedCodes(policy.unrestricted ? null : policy.codes)
      } catch {
        if (!cancelled) setAllowedCodes(null)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const countries = useMemo(
    () => filterResidenceCountryCatalog(allowedCodes),
    [allowedCodes],
  )

  useEffect(() => {
    if (!tooltipOpen) return
    const id = setTimeout(() => setTooltipOpen(false), 4000)
    return () => clearTimeout(id)
  }, [tooltipOpen])

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

  return (
    <View style={[styles.wrap, containerStyle]}>
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
          <ScrollView
            keyboardShouldPersistTaps="handled"
            style={styles.list}
            nestedScrollEnabled
            showsVerticalScrollIndicator
          >
            {filtered.length === 0 ? (
              <Text style={styles.empty}>No countries found.</Text>
            ) : (
              filtered.map((item) => (
                <Pressable
                  key={item.code}
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
              ))
            )}
          </ScrollView>
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

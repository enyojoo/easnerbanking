import React, { useMemo } from 'react'
import { View, Text, TextInput, Pressable, StyleSheet, Platform } from 'react-native'
import { Check, ChevronDown, ChevronUp, Search } from 'lucide-react-native'
import * as Haptics from 'expo-haptics'
import RecipientFormDropdownList from './RecipientFormDropdownList'
import { colors, spacing, textStyles, borderRadius, fontFamily, surfaceFrameStyle } from '../../theme'
import { ripple } from '../../lib/androidRipple'

type Props = {
  banks: string[]
  value: string
  onChange: (bank: string) => void
  placeholder: string
  disabled?: boolean
  hasError?: boolean
  errorMessage?: string
  showDropdown: boolean
  onToggleDropdown: () => void
  searchTerm: string
  onSearchTermChange: (term: string) => void
  onCloseDropdown: () => void
  renderDropdownContainer: (onClose: () => void, content: React.ReactNode) => React.ReactNode
  onBlurValidate?: (value: string) => void
}

/** Searchable bank picker (same inline dropdown pattern as country / provider). */
export function RecipientBankNameField({
  banks,
  value,
  onChange,
  placeholder,
  disabled,
  hasError,
  errorMessage,
  showDropdown,
  onToggleDropdown,
  searchTerm,
  onSearchTermChange,
  onCloseDropdown,
  renderDropdownContainer,
  onBlurValidate,
}: Props) {
  const sorted = useMemo(() => [...banks].sort((a, b) => a.localeCompare(b)), [banks])
  const filtered = useMemo(
    () =>
      sorted.filter((b) => b.toLowerCase().includes(searchTerm.trim().toLowerCase())),
    [sorted, searchTerm],
  )

  if (sorted.length === 0) {
    return (
      <View>
        <TextInput
          style={[styles.textInput, hasError && styles.textInputError]}
          value={value}
          onChangeText={onChange}
          onBlur={() => onBlurValidate?.(value)}
          placeholder={placeholder}
          placeholderTextColor={colors.text.secondary}
          autoCapitalize="words"
          returnKeyType="done"
          editable={!disabled}
        />
        {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}
      </View>
    )
  }

  const close = () => {
    onCloseDropdown()
    onSearchTermChange('')
  }

  return (
    <View style={[styles.wrapper, showDropdown && styles.wrapperActive]}>
      <Pressable
        android_ripple={ripple.neutral}
        style={[styles.selector, hasError && styles.textInputError]}
        onPress={onToggleDropdown}
        disabled={disabled}
      >
        <View style={styles.selectorContent}>
          <Text
            style={value ? styles.valueText : styles.placeholderText}
            numberOfLines={1}
          >
            {value || placeholder}
          </Text>
          {showDropdown ? (
            <ChevronUp size={16} color={colors.brand.slate} strokeWidth={2} />
          ) : (
            <ChevronDown size={16} color={colors.brand.slate} strokeWidth={2} />
          )}
        </View>
      </Pressable>
      {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}
      {showDropdown &&
        renderDropdownContainer(
          close,
          <>
            <View style={styles.searchRow}>
              <Search size={18} color={colors.neutral[400]} strokeWidth={2} />
              <TextInput
                style={styles.searchInput}
                placeholder="Search banks…"
                placeholderTextColor={colors.neutral[400]}
                value={searchTerm}
                onChangeText={onSearchTermChange}
                autoCorrect={false}
              />
            </View>
            <RecipientFormDropdownList>
              {filtered.length === 0 ? (
                <View style={styles.emptyRow}>
                  <Text style={styles.emptyText}>No banks found</Text>
                </View>
              ) : (
                filtered.map((bank) => (
                  <Pressable
                    key={bank}
                    android_ripple={ripple.neutral}
                    style={[styles.item, value === bank && styles.itemSelected]}
                    onPress={async () => {
                      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
                      onChange(bank)
                      onBlurValidate?.(bank)
                      close()
                    }}
                  >
                    <Text style={styles.itemLabel} numberOfLines={2}>
                      {bank}
                    </Text>
                    {value === bank ? (
                      <Check size={18} color={colors.primary.main} strokeWidth={2.5} />
                    ) : null}
                  </Pressable>
                ))
              )}
            </RecipientFormDropdownList>
          </>,
        )}
    </View>
  )
}

const styles = StyleSheet.create({
  wrapper: {
    marginBottom: spacing[2],
    zIndex: 1000,
  },
  wrapperActive: {
    zIndex: 4000,
  },
  selector: {
    ...surfaceFrameStyle(colors, { shadow: 'none', radius: borderRadius.full }),
    padding: spacing[3],
    borderWidth: 1.5,
    borderColor: colors.frame.border,
    backgroundColor: colors.frame.background,
    minHeight: 48,
    justifyContent: 'center',
  },
  selectorContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  valueText: {
    flex: 1,
    ...textStyles.bodyMedium,
    color: colors.text.primary,
    fontFamily: fontFamily.regular,
  },
  placeholderText: {
    flex: 1,
    ...textStyles.bodyMedium,
    color: colors.text.secondary,
    fontFamily: fontFamily.regular,
  },
  textInput: {
    borderWidth: 1.5,
    borderColor: colors.frame.border,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    ...textStyles.bodyMedium,
    color: colors.text.primary,
    marginBottom: spacing[2],
    backgroundColor: colors.frame.background,
    fontFamily: fontFamily.regular,
    fontSize: 13,
    minHeight: 48,
    ...Platform.select({
      android: { includeFontPadding: false, textAlignVertical: 'center' },
    }),
  },
  textInputError: {
    borderColor: colors.error.main,
  },
  errorText: {
    ...textStyles.bodySmall,
    color: colors.error.main,
    marginTop: -spacing[1],
    marginBottom: spacing[2],
    marginLeft: spacing[1],
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    borderBottomWidth: 1,
    borderBottomColor: colors.border.light,
    gap: spacing[2],
  },
  searchInput: {
    flex: 1,
    ...textStyles.textInputMedium,
    color: colors.text.primary,
    paddingVertical: 0,
    ...Platform.select({
      android: { includeFontPadding: false, textAlignVertical: 'center' },
    }),
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

import React, { useRef } from 'react'
import {
  View,
  TextInput,
  StyleSheet,
  findNodeHandle,
  type ScrollView,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native'
import { PostHogMaskView } from 'posthog-react-native'
import { colors } from '../../theme'

type Values = {
  addressLine1: string
  city: string
  state: string
  postalCode: string
}

type Props = {
  values: Values
  onChange: (patch: Partial<Values>) => void
  isSubmitting?: boolean
  scrollRef: React.RefObject<ScrollView | null>
  inputStyle: StyleProp<TextStyle>
  rowStyle?: StyleProp<ViewStyle>
  halfInputStyle?: StyleProp<ViewStyle>
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

/** US bank payout holder address (Noah requires street, city, state, ZIP). */
export function UsBankAddressFields({
  values,
  onChange,
  isSubmitting,
  scrollRef,
  inputStyle,
  rowStyle,
  halfInputStyle,
}: Props) {
  return (
    <PostHogMaskView>
      <FieldInput
        scrollRef={scrollRef}
        style={inputStyle}
        value={values.addressLine1}
        onChangeText={(text) => onChange({ addressLine1: text })}
        placeholder="Street address *"
        placeholderTextColor={colors.text.secondary}
        autoCapitalize="words"
        editable={!isSubmitting}
      />
      <FieldInput
        scrollRef={scrollRef}
        style={inputStyle}
        value={values.city}
        onChangeText={(text) => onChange({ city: text })}
        placeholder="City *"
        placeholderTextColor={colors.text.secondary}
        autoCapitalize="words"
        editable={!isSubmitting}
      />
      <View style={[styles.row, rowStyle]}>
        <View style={[styles.half, halfInputStyle]}>
          <FieldInput
            scrollRef={scrollRef}
            style={inputStyle}
            value={values.state}
            onChangeText={(text) => onChange({ state: text })}
            placeholder="State *"
            placeholderTextColor={colors.text.secondary}
            autoCapitalize="characters"
            editable={!isSubmitting}
          />
        </View>
        <View style={[styles.half, halfInputStyle]}>
          <FieldInput
            scrollRef={scrollRef}
            style={inputStyle}
            value={values.postalCode}
            onChangeText={(text) => onChange({ postalCode: text })}
            placeholder="ZIP *"
            placeholderTextColor={colors.text.secondary}
            keyboardType="number-pad"
            editable={!isSubmitting}
          />
        </View>
      </View>
    </PostHogMaskView>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 12 },
  half: { flex: 1 },
})

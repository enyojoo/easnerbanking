import React from 'react'
import { View, Text, Pressable } from 'react-native'
import { AtSign, Building2, ChevronRight, Smartphone, Wallet } from 'lucide-react-native'
import type { LucideIcon } from 'lucide-react-native'
import { colors } from '../../theme'
import { ripple } from '../../lib/androidRipple'
import { haptics } from '../../lib/haptics'
import type { RecipientFormType } from '../../lib/recipientForm/recipientFormTypes'
import { recipientFormStyles as styles } from './recipientFormStyles'

const TYPE_OPTIONS: Array<{
  type: RecipientFormType
  title: string
  subtitle: string
  Icon: LucideIcon
}> = [
  {
    type: 'wallet',
    title: 'Wallet Address',
    subtitle: 'Send stablecoins to an address',
    Icon: Wallet,
  },
  {
    type: 'bank',
    title: 'Bank Account',
    subtitle: 'Send cash to a bank account',
    Icon: Building2,
  },
  {
    type: 'mobile',
    title: 'Mobile Money',
    subtitle: 'Send cash via mobile money',
    Icon: Smartphone,
  },
  {
    type: 'easenet',
    title: 'Easetag',
    subtitle: 'Send cash via Easner handle',
    Icon: AtSign,
  },
]

type Props = {
  onSelectType: (type: RecipientFormType) => void
}

export function RecipientTypeOptions({ onSelectType }: Props) {
  return (
    <View style={styles.recipientTypeOptions}>
      {TYPE_OPTIONS.map(({ type, title, subtitle, Icon }) => (
        <Pressable
          key={type}
          android_ripple={ripple.neutral}
          style={styles.recipientTypeOption}
          accessibilityRole="button"
          accessibilityLabel={title}
          accessibilityHint={`Opens the ${title.toLowerCase()} form`}
          onPress={() => {
            haptics.tap()
            onSelectType(type)
          }}
        >
          <View style={styles.recipientTypeIcon}>
            <Icon size={24} color={colors.primary.main} strokeWidth={2} />
          </View>
          <View style={styles.recipientTypeContent}>
            <Text style={styles.recipientTypeTitle}>{title}</Text>
            <Text style={styles.recipientTypeSubtitle}>{subtitle}</Text>
          </View>
          <ChevronRight size={20} color={colors.text.secondary} strokeWidth={2} />
        </Pressable>
      ))}
    </View>
  )
}

import React from 'react'
import { View, Text, StyleSheet } from 'react-native'
import {
  formatStablecoinDepositSchemeLabel,
  receiveStablecoinDepositSubtitle,
} from '@easner/shared'
import { colors, spacing, textStyles } from '../../theme'
import { CachedImage } from '../CachedImage'
import { getTokenIconUrl } from '../../lib/cryptoIcons'
import { ReceiveLocalRailCard } from './ReceiveLocalRailCard'

const ICON_SIZE = 48

export type StablecoinReceiveMethod = {
  id: string
  asset: string
  network: string
  status: 'active' | 'provisioning' | 'unavailable'
  address?: string
  memo?: string
}

function methodTitle(method: StablecoinReceiveMethod): string {
  return formatStablecoinDepositSchemeLabel({
    asset: method.asset,
    chain: method.network,
  })
}

function methodSubtitle(method: StablecoinReceiveMethod): string {
  return receiveStablecoinDepositSubtitle({
    asset: method.asset,
    network: method.network,
    status: method.status,
  })
}

function StablecoinMethodIcon({ asset }: { asset: string }) {
  const uri = getTokenIconUrl(asset)
  if (uri) {
    return (
      <CachedImage
        uri={uri}
        style={{ width: ICON_SIZE, height: ICON_SIZE }}
        contentFit="cover"
      />
    )
  }
  return (
    <View style={styles.iconFallback}>
      <Text style={styles.iconFallbackText}>{asset.slice(0, 2)}</Text>
    </View>
  )
}

export function ReceiveStablecoinMethodList(props: {
  methods: StablecoinReceiveMethod[]
  onSelect: (method: StablecoinReceiveMethod) => void
}) {
  if (props.methods.length === 0) {
    return (
      <Text style={styles.unavailable}>
        Stablecoin deposit methods are not available right now.
      </Text>
    )
  }

  return (
    <View style={styles.list}>
      {props.methods.map((method) => (
        <ReceiveLocalRailCard
          key={method.id}
          title={methodTitle(method)}
          subtitle={methodSubtitle(method)}
          leading={<StablecoinMethodIcon asset={method.asset} />}
          onPress={() => props.onSelect(method)}
          disabled={method.status !== 'active'}
        />
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  list: {
    gap: spacing[3],
  },
  unavailable: {
    ...textStyles.body,
    color: colors.text.secondary,
    textAlign: 'center',
    marginTop: spacing[4],
  },
  iconFallback: {
    width: ICON_SIZE,
    height: ICON_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary.main + '15',
  },
  iconFallbackText: {
    ...textStyles.caption,
    color: colors.primary.main,
    fontWeight: '600',
  },
})

import React, { useCallback, useMemo } from 'react'
import { RefreshControl, ViewStyle } from 'react-native'
import type { ListRenderItem } from '@shopify/flash-list'
import { FlashList } from '@shopify/flash-list'
import type { InfiniteData, InfiniteQueryObserverResult } from '@tanstack/react-query'
import type { MobileTransactionRow } from '../../hooks/queries/use-transactions'
import { useThemeColors } from '../../contexts/ThemePaletteContext'

/**
 * Mobile ledger list primitive for long transaction histories.
 * Uses `@shopify/flash-list` for windowed recycling.
 */

type InfinitePages = InfiniteData<{
  transactions: MobileTransactionRow[]
  nextCursor: string | null
}>

type Props = {
  data: InfinitePages | undefined
  renderItem: ListRenderItem<MobileTransactionRow>
  onEndReached?: () => void
  onRefresh?: () => void | Promise<unknown>
  isRefreshing?: boolean
  estimatedItemSize?: number
  ListHeaderComponent?: React.ComponentType | React.ReactElement | null
  ListEmptyComponent?: React.ComponentType | React.ReactElement | null
  ListFooterComponent?: React.ComponentType | React.ReactElement | null
  style?: ViewStyle
  contentContainerStyle?: ViewStyle
}

export function TransactionsList({
  data,
  renderItem,
  onEndReached,
  onRefresh,
  isRefreshing,
  estimatedItemSize = 72,
  ListHeaderComponent,
  ListEmptyComponent,
  ListFooterComponent,
  style,
  contentContainerStyle,
}: Props) {
  const colors = useThemeColors()
  const flat = useMemo<MobileTransactionRow[]>(() => {
    if (!data) return []
    return data.pages.flatMap((p) => p.transactions ?? [])
  }, [data])

  const keyExtractor = useCallback(
    (item: MobileTransactionRow, index: number) =>
      String(item.id ?? item.transaction_id ?? `row-${index}`),
    [],
  )

  return (
    <FlashList
      data={flat}
      renderItem={renderItem}
      keyExtractor={keyExtractor}
      estimatedItemSize={estimatedItemSize}
      onEndReached={onEndReached}
      onEndReachedThreshold={0.4}
      drawDistance={800}
      ListHeaderComponent={ListHeaderComponent}
      ListEmptyComponent={ListEmptyComponent}
      ListFooterComponent={ListFooterComponent}
      style={style}
      contentContainerStyle={contentContainerStyle}
      refreshControl={
        onRefresh ? (
          <RefreshControl
            refreshing={Boolean(isRefreshing)}
            onRefresh={onRefresh}
            tintColor={colors.primary.main}
          />
        ) : undefined
      }
    />
  )
}

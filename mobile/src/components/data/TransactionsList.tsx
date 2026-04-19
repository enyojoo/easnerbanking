import React, { useCallback, useMemo } from 'react'
import { FlatList, FlatListProps, ListRenderItem, RefreshControl, ViewStyle } from 'react-native'
import type { InfiniteData, InfiniteQueryObserverResult } from '@tanstack/react-query'
import type { MobileTransactionRow } from '../../hooks/queries/use-transactions'
import { useThemeColors } from '../../contexts/ThemePaletteContext'

/**
 * Mobile ledger list primitive, designed for instant scroll performance
 * over long transaction histories.
 *
 * Uses React Native's `FlatList` with tuned windowing constants. It's a
 * drop-in swap for `@shopify/flash-list` when that's installed — the
 * render item signature matches. Callers own row rendering.
 *
 * Wire `query.fetchNextPage` to `onEndReached` and pull-to-refresh to
 * `query.refetch` for the full SWR loop.
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
  ListHeaderComponent?: FlatListProps<MobileTransactionRow>['ListHeaderComponent']
  ListEmptyComponent?: FlatListProps<MobileTransactionRow>['ListEmptyComponent']
  ListFooterComponent?: FlatListProps<MobileTransactionRow>['ListFooterComponent']
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
    <FlatList
      data={flat}
      renderItem={renderItem}
      keyExtractor={keyExtractor}
      onEndReached={onEndReached}
      onEndReachedThreshold={0.4}
      removeClippedSubviews
      initialNumToRender={12}
      windowSize={9}
      maxToRenderPerBatch={10}
      updateCellsBatchingPeriod={32}
      getItemLayout={(_, index) => ({
        length: estimatedItemSize,
        offset: estimatedItemSize * index,
        index,
      })}
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

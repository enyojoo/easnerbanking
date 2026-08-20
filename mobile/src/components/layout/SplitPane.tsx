import React, { type ReactNode, useMemo } from 'react'
import { Platform, StyleSheet, View, useWindowDimensions } from 'react-native'
import { spacing } from '../../theme'
import { isRegularWidth } from '../../theme/layoutMetrics'
import { scaledFontSize } from '../../theme/typography'

export type SplitPaneConfig = {
  maxWidth: number
  listFlex: number
  detailFlex: number
  gap: number
  detailPadding: number
  titleSize: number
  nameSize: number
  metaSize: number
  amountSize: number
}

type SplitPaneProps = {
  list: ReactNode
  detail?: ReactNode
  showDetail?: boolean
  /** Override breakpoint behavior – defaults to regular width (600+). */
  enabled?: boolean
}

export function useSplitPaneConfig(): { regularWidth: boolean; config: SplitPaneConfig } {
  const { width: windowWidth } = useWindowDimensions()
  // Web: match mobile – tap a row to push TransactionDetails (no inline preview pane).
  const regularWidth = Platform.OS === 'web' ? false : isRegularWidth(windowWidth)

  const config = useMemo<SplitPaneConfig>(() => {
    if (windowWidth >= 1024) {
      return {
        maxWidth: Math.min(windowWidth - spacing[10], 980),
        listFlex: 1.1,
        detailFlex: 0.9,
        gap: spacing[4],
        detailPadding: spacing[5],
        titleSize: scaledFontSize(12, windowWidth),
        nameSize: scaledFontSize(22, windowWidth),
        metaSize: scaledFontSize(13, windowWidth),
        amountSize: scaledFontSize(28, windowWidth),
      }
    }
    if (windowWidth >= 768) {
      return {
        maxWidth: Math.min(windowWidth - spacing[8], 920),
        listFlex: 1.16,
        detailFlex: 0.84,
        gap: spacing[4],
        detailPadding: spacing[5],
        titleSize: scaledFontSize(12, windowWidth),
        nameSize: scaledFontSize(20, windowWidth),
        metaSize: scaledFontSize(12, windowWidth),
        amountSize: scaledFontSize(26, windowWidth),
      }
    }
    return {
      maxWidth: Math.min(windowWidth - spacing[6], 860),
      listFlex: 1.28,
      detailFlex: 0.72,
      gap: spacing[3],
      detailPadding: spacing[4],
      titleSize: scaledFontSize(11, windowWidth),
      nameSize: scaledFontSize(18, windowWidth),
      metaSize: scaledFontSize(12, windowWidth),
      amountSize: scaledFontSize(24, windowWidth),
    }
  }, [windowWidth])

  return { regularWidth, config }
}

export function SplitPane({ list, detail, showDetail = false, enabled }: SplitPaneProps) {
  const { regularWidth, config } = useSplitPaneConfig()
  const split = enabled ?? regularWidth

  if (!split) {
    return <>{list}</>
  }

  return (
    <View style={[styles.container, { maxWidth: config.maxWidth }]}>
      <View style={[styles.row, { gap: config.gap }]}>
        <View style={[styles.listPane, { flex: config.listFlex }]}>{list}</View>
        {showDetail && detail ? (
          <View
            style={[
              styles.detailPane,
              { flex: config.detailFlex, padding: config.detailPadding },
            ]}
          >
            {detail}
          </View>
        ) : null}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    alignSelf: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'stretch',
    width: '100%',
  },
  listPane: {
    minWidth: 0,
  },
  detailPane: {
    minWidth: 0,
    borderRadius: spacing[4],
    backgroundColor: 'transparent',
  },
})

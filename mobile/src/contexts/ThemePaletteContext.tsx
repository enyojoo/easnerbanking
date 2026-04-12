import React, { createContext, useContext, useMemo, type ReactNode } from 'react'
import { colors } from '../theme/colors'
import type { Colors } from '../theme/colors'
import { resolveThemeColors } from '../theme/resolveThemeColors'

const ThemePaletteContext = createContext<Colors>(colors)

export function ThemePaletteProvider({ children }: { children: ReactNode }) {
  const value = useMemo(() => resolveThemeColors('light'), [])
  return <ThemePaletteContext.Provider value={value}>{children}</ThemePaletteContext.Provider>
}

export function useThemeColors(): Colors {
  return useContext(ThemePaletteContext)
}

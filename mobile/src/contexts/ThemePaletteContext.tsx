import AsyncStorage from '@react-native-async-storage/async-storage'
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { Appearance, useColorScheme, type ColorSchemeName } from 'react-native'
import { lightColors } from '../theme/colors'
import type { Colors } from '../theme/colors'
import { resolveThemeColors } from '../theme/resolveThemeColors'

/**
 * Theme mode supported by the app.
 * - `system` follows the OS color scheme via `useColorScheme()` +
 *   `Appearance` API. New installs default to `light`; users can pick
 *   `dark` or `system` and persist via AsyncStorage.
 * - `light` / `dark` override the OS and persist via AsyncStorage.
 */
export type ThemeMode = 'system' | 'light' | 'dark'

const STORAGE_KEY = '@easner/theme-mode'
const ALLOWED_MODES: ReadonlyArray<ThemeMode> = ['system', 'light', 'dark']

type ThemePaletteContextValue = {
  colors: Colors
  scheme: 'light' | 'dark'
  mode: ThemeMode
  setMode: (mode: ThemeMode) => Promise<void>
}

const defaultValue: ThemePaletteContextValue = {
  colors: lightColors,
  scheme: 'light',
  mode: 'light',
  setMode: async () => {},
}

const ThemePaletteContext = createContext<ThemePaletteContextValue>(defaultValue)

function normalizeScheme(scheme: ColorSchemeName | null | undefined): 'light' | 'dark' {
  return scheme === 'dark' ? 'dark' : 'light'
}

export function ThemePaletteProvider({ children }: { children: ReactNode }) {
  const systemScheme = useColorScheme()
  const [mode, setModeState] = useState<ThemeMode>('light')
  const [systemOverride, setSystemOverride] = useState<'light' | 'dark'>(
    normalizeScheme(systemScheme),
  )

  useEffect(() => {
    let cancelled = false
    AsyncStorage.getItem(STORAGE_KEY)
      .then((stored) => {
        if (cancelled) return
        if (stored && (ALLOWED_MODES as ReadonlyArray<string>).includes(stored)) {
          setModeState(stored as ThemeMode)
        }
      })
      .catch(() => {
        /* swallow — keep in-memory default (light) */
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const next = normalizeScheme(systemScheme)
    setSystemOverride((prev) => (prev === next ? prev : next))
  }, [systemScheme])

  useEffect(() => {
    const sub = Appearance.addChangeListener(({ colorScheme }) => {
      setSystemOverride((prev) => {
        const next = normalizeScheme(colorScheme)
        return prev === next ? prev : next
      })
    })
    return () => sub.remove()
  }, [])

  const scheme: 'light' | 'dark' = useMemo(() => {
    if (mode === 'light' || mode === 'dark') return mode
    return systemOverride
  }, [mode, systemOverride])

  const colors = useMemo(() => resolveThemeColors(scheme), [scheme])

  const setMode = useCallback(async (next: ThemeMode) => {
    setModeState(next)
    try {
      await AsyncStorage.setItem(STORAGE_KEY, next)
    } catch {
      /* non-fatal — state is already updated in memory */
    }
  }, [])

  const value = useMemo<ThemePaletteContextValue>(
    () => ({ colors, scheme, mode, setMode }),
    [colors, scheme, mode, setMode],
  )

  return <ThemePaletteContext.Provider value={value}>{children}</ThemePaletteContext.Provider>
}

export function useThemeColors(): Colors {
  return useContext(ThemePaletteContext).colors
}

export function useThemeScheme(): 'light' | 'dark' {
  return useContext(ThemePaletteContext).scheme
}

export function useThemeMode(): {
  mode: ThemeMode
  setMode: (mode: ThemeMode) => Promise<void>
} {
  const { mode, setMode } = useContext(ThemePaletteContext)
  return { mode, setMode }
}

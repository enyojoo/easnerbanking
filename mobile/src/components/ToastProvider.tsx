import React, { createContext, useContext, useState, useCallback, useEffect, useMemo } from 'react'
import { View, StyleSheet } from 'react-native'
import Toast, { ToastType } from './Toast'

interface ToastData {
  id: string
  message: string
  type: ToastType
  duration?: number
  action?: {
    label: string
    onPress: () => void
  }
}

interface ToastContextType {
  showToast: (
    message: string,
    type?: ToastType,
    duration?: number,
    action?: { label: string; onPress: () => void }
  ) => void
  showSuccess: (message: string, duration?: number) => void
  showError: (message: string, duration?: number) => void
  showInfo: (message: string, duration?: number) => void
  showWarning: (message: string, duration?: number) => void
  /** @internal – used by ToastViewport / ModalToastHost to render the toasts. */
  _toasts: ToastData[]
  /** @internal */
  _removeToast: (id: string) => void
  /**
   * @internal – a Modal can register itself as the active toast host so toasts
   * render inside it (on top). Native Modals present in a separate window, so a
   * root-level overlay would otherwise be hidden behind an open Modal.
   */
  _registerModalHost: () => () => void
  /** @internal – true while a Modal host is mounted; root viewport hides to avoid duplicates. */
  _modalHostActive: boolean
}

const ToastContext = createContext<ToastContextType | undefined>(undefined)

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastData[]>([])
  const [modalHostCount, setModalHostCount] = useState(0)

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id))
  }, [])

  const registerModalHost = useCallback(() => {
    setModalHostCount((c) => c + 1)
    return () => setModalHostCount((c) => Math.max(0, c - 1))
  }, [])

  const showToast = useCallback(
    (
      message: string,
      type: ToastType = 'info',
      duration = 3000,
      action?: { label: string; onPress: () => void }
    ) => {
      const id = `toast-${Date.now()}-${Math.random()}`
      setToasts((prev) => [...prev, { id, message, type, duration, action }])
    },
    []
  )

  const showSuccess = useCallback(
    (message: string, duration = 3000) => {
      showToast(message, 'success', duration)
    },
    [showToast]
  )

  const showError = useCallback(
    (message: string, duration?: number) => {
      const ms =
        duration ??
        Math.min(10_000, Math.max(5000, 3500 + Math.ceil(message.length / 24) * 1000))
      showToast(message, 'error', ms)
    },
    [showToast]
  )

  const showInfo = useCallback(
    (message: string, duration = 3000) => {
      showToast(message, 'info', duration)
    },
    [showToast]
  )

  const showWarning = useCallback(
    (message: string, duration = 3500) => {
      showToast(message, 'warning', duration)
    },
    [showToast]
  )

  const value = useMemo<ToastContextType>(
    () => ({
      showToast,
      showSuccess,
      showError,
      showInfo,
      showWarning,
      _toasts: toasts,
      _removeToast: removeToast,
      _registerModalHost: registerModalHost,
      _modalHostActive: modalHostCount > 0,
    }),
    [
      showToast,
      showSuccess,
      showError,
      showInfo,
      showWarning,
      toasts,
      removeToast,
      registerModalHost,
      modalHostCount,
    ],
  )

  return (
    <ToastContext.Provider value={value}>
      {children}
      {/* Root overlay for normal screens. While a Modal hosts the toasts (see
          ModalToastHost), the root viewport hides so toasts don't render twice. */}
      {modalHostCount === 0 ? <ToastViewport /> : null}
    </ToastContext.Provider>
  )
}

/** Renders the active toasts as a top-anchored overlay. Reused at the root and inside Modals. */
export function ToastViewport() {
  const context = useContext(ToastContext)
  if (!context) return null
  const { _toasts, _removeToast } = context
  return (
    <View style={styles.container} pointerEvents="box-none">
      {_toasts.map((toast) => (
        <Toast
          key={toast.id}
          message={toast.message}
          type={toast.type}
          duration={toast.duration}
          action={toast.action}
          onClose={() => _removeToast(toast.id)}
        />
      ))}
    </View>
  )
}

/**
 * Drop inside a native Modal (e.g. the receipt sheet) so toasts appear on top of
 * it. Native Modals present in their own window, so the root overlay would be
 * hidden behind them; this re-hosts the toasts within the Modal instead.
 */
export function ModalToastHost() {
  const context = useContext(ToastContext)
  const register = context?._registerModalHost

  useEffect(() => {
    if (!register) return
    return register()
  }, [register])

  if (!context) return null
  return <ToastViewport />
}

export function useToast() {
  const context = useContext(ToastContext)
  if (context === undefined) {
    throw new Error('useToast must be used within a ToastProvider')
  }
  return context
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 1000,
  },
})























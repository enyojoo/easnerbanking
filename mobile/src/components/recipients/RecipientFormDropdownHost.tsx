import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { Keyboard, Platform, View } from 'react-native'
import RecipientFormSelectSheet from './RecipientFormSelectSheet'

type DropdownAnchor = {
  x: number
  y: number
  width: number
  height: number
}

type DropdownSheetState = {
  content: React.ReactNode
  onClose: () => void
  anchor: DropdownAnchor | null
} | null

type CloseSheetOptions = {
  notify?: boolean
}

type RecipientFormDropdownHostContextValue = {
  openSheet: (content: React.ReactNode, onClose: () => void, anchor: DropdownAnchor | null) => void
  syncSheetContent: (content: React.ReactNode) => void
  syncSheetAnchor: (anchor: DropdownAnchor | null) => void
  closeSheet: (options?: CloseSheetOptions) => void
}

const RecipientFormDropdownHostContext = createContext<RecipientFormDropdownHostContextValue | null>(
  null,
)

export function RecipientFormDropdownHost({ children }: { children: React.ReactNode }) {
  const [sheet, setSheet] = useState<DropdownSheetState>(null)
  const [keyboardBottom, setKeyboardBottom] = useState(0)

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow'
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide'
    const onShow = Keyboard.addListener(showEvent, (e) => {
      setKeyboardBottom(e.endCoordinates?.height ?? 0)
    })
    const onHide = Keyboard.addListener(hideEvent, () => setKeyboardBottom(0))
    return () => {
      onShow.remove()
      onHide.remove()
    }
  }, [])

  const closeSheet = useCallback((options?: CloseSheetOptions) => {
    const notify = options?.notify !== false
    setSheet((prev) => {
      if (prev && notify) {
        prev.onClose()
      }
      return null
    })
  }, [])

  const openSheet = useCallback(
    (content: React.ReactNode, onClose: () => void, anchor: DropdownAnchor | null) => {
      setSheet({ content, onClose, anchor })
    },
    [],
  )

  const syncSheetAnchor = useCallback((anchor: DropdownAnchor | null) => {
    setSheet((prev) => (prev ? { ...prev, anchor } : null))
  }, [])

  const syncSheetContent = useCallback((content: React.ReactNode) => {
    setSheet((prev) => (prev ? { ...prev, content } : null))
  }, [])

  const value = useMemo(
    () => ({ openSheet, syncSheetContent, syncSheetAnchor, closeSheet }),
    [openSheet, syncSheetContent, syncSheetAnchor, closeSheet],
  )

  return (
    <RecipientFormDropdownHostContext.Provider value={value}>
      {children}
      <RecipientFormSelectSheet
        visible={sheet != null}
        onClose={() => closeSheet({ notify: true })}
        anchor={sheet?.anchor ?? null}
        keyboardBottom={keyboardBottom}
      >
        {sheet?.content}
      </RecipientFormSelectSheet>
    </RecipientFormDropdownHostContext.Provider>
  )
}

/** Mount picker content in the shared anchored overlay while `visible` is true. */
export function useRecipientFormDropdownSheet(
  visible: boolean,
  onClose: () => void,
  content: React.ReactNode,
) {
  const ctx = useContext(RecipientFormDropdownHostContext)
  if (!ctx) {
    throw new Error('useRecipientFormDropdownSheet must be used within RecipientFormDropdownHost')
  }

  const onCloseRef = useRef(onClose)
  const contentRef = useRef(content)
  onCloseRef.current = onClose
  contentRef.current = content

  const stableOnClose = useCallback(() => {
    onCloseRef.current()
  }, [])

  useLayoutEffect(() => {
    if (!visible) return
    ctx.openSheet(contentRef.current, stableOnClose, null)
    return () => {
      ctx.closeSheet({ notify: false })
    }
  }, [visible, ctx, stableOnClose])

  useLayoutEffect(() => {
    if (!visible) return
    ctx.syncSheetContent(contentRef.current)
  }, [content, visible, ctx])
}

/** Renders an invisible anchor inline; shows `children` in the shared anchored overlay while `visible`. */
export function RegisterRecipientDropdownSheet({
  visible,
  onClose,
  children,
}: {
  visible: boolean
  onClose: () => void
  children: React.ReactNode
}) {
  const anchorRef = useRef<View>(null)
  const ctx = useContext(RecipientFormDropdownHostContext)
  if (!ctx) {
    throw new Error('RegisterRecipientDropdownSheet must be used within RecipientFormDropdownHost')
  }

  const measureAnchor = useCallback(
    (callback: (anchor: DropdownAnchor | null) => void) => {
      requestAnimationFrame(() => {
        anchorRef.current?.measureInWindow((x, y, width, height) => {
          callback(width > 0 ? { x, y, width, height } : null)
        })
      })
    },
    [],
  )

  const onCloseRef = useRef(onClose)
  const contentRef = useRef(children)
  onCloseRef.current = onClose
  contentRef.current = children

  const stableOnClose = useCallback(() => {
    onCloseRef.current()
  }, [])

  useLayoutEffect(() => {
    if (!visible) return
    measureAnchor((anchor) => {
      ctx.openSheet(contentRef.current, stableOnClose, anchor)
    })
    return () => {
      ctx.closeSheet({ notify: false })
    }
  }, [visible, ctx, stableOnClose, measureAnchor])

  useLayoutEffect(() => {
    if (!visible) return
    ctx.syncSheetContent(contentRef.current)
    measureAnchor(ctx.syncSheetAnchor)
  }, [children, visible, ctx, measureAnchor])

  return <View ref={anchorRef} collapsable={false} pointerEvents="none" style={{ height: 0, width: '100%' }} />
}

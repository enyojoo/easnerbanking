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
import { Keyboard, Platform } from 'react-native'
import RecipientFormSelectSheet from './RecipientFormSelectSheet'

type DropdownSheetState = {
  content: React.ReactNode
  onClose: () => void
} | null

type CloseSheetOptions = {
  notify?: boolean
}

type RecipientFormDropdownHostContextValue = {
  openSheet: (content: React.ReactNode, onClose: () => void) => void
  syncSheetContent: (content: React.ReactNode) => void
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

  const openSheet = useCallback((content: React.ReactNode, onClose: () => void) => {
    setSheet({ content, onClose })
  }, [])

  const syncSheetContent = useCallback((content: React.ReactNode) => {
    setSheet((prev) => (prev ? { ...prev, content } : null))
  }, [])

  const value = useMemo(
    () => ({ openSheet, syncSheetContent, closeSheet }),
    [openSheet, syncSheetContent, closeSheet],
  )

  return (
    <RecipientFormDropdownHostContext.Provider value={value}>
      {children}
      <RecipientFormSelectSheet
        visible={sheet != null}
        onClose={() => closeSheet({ notify: true })}
        keyboardBottom={keyboardBottom}
      >
        {sheet?.content}
      </RecipientFormSelectSheet>
    </RecipientFormDropdownHostContext.Provider>
  )
}

/** Mount picker content in the bottom sheet while `visible` is true. */
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
    ctx.openSheet(contentRef.current, stableOnClose)
    return () => {
      ctx.closeSheet({ notify: false })
    }
  }, [visible, ctx, stableOnClose])

  useLayoutEffect(() => {
    if (!visible) return
    ctx.syncSheetContent(contentRef.current)
  }, [content, visible, ctx])
}

/** Renders nothing inline; shows `children` in the shared bottom sheet while `visible`. */
export function RegisterRecipientDropdownSheet({
  visible,
  onClose,
  children,
}: {
  visible: boolean
  onClose: () => void
  children: React.ReactNode
}) {
  useRecipientFormDropdownSheet(visible, onClose, children)
  return null
}

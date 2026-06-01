import React, { createContext, useCallback, useContext, useMemo, useState } from 'react'
import { Keyboard, Platform } from 'react-native'
import { useEffect } from 'react'
import RecipientFormSelectSheet from './RecipientFormSelectSheet'

type DropdownSheetState = {
  content: React.ReactNode
  onClose: () => void
} | null

type RecipientFormDropdownHostContextValue = {
  openSheet: (content: React.ReactNode, onClose: () => void) => void
  closeSheet: () => void
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

  const closeSheet = useCallback(() => {
    setSheet((prev) => {
      prev?.onClose()
      return null
    })
  }, [])

  const openSheet = useCallback((content: React.ReactNode, onClose: () => void) => {
    setSheet((prev) => {
      if (prev?.onClose !== onClose) {
        prev?.onClose()
      }
      return { content, onClose }
    })
  }, [])

  const value = useMemo(
    () => ({ openSheet, closeSheet }),
    [openSheet, closeSheet],
  )

  return (
    <RecipientFormDropdownHostContext.Provider value={value}>
      {children}
      <RecipientFormSelectSheet
        embedded
        visible={sheet != null}
        onClose={closeSheet}
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

  useEffect(() => {
    if (!visible) return
    ctx.openSheet(content, onClose)
    return () => {
      ctx.closeSheet()
    }
  }, [visible, onClose, content, ctx])
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
